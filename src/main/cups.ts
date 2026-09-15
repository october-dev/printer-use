import { promises as fs } from 'node:fs'
import { run } from './exec'
import type {
  Printer,
  PrintJob,
  PrinterState,
  ResolvedCommand,
  CommandResult,
  AddPrinterOpts,
  PpdEntry,
  DriverStrategy
} from '../shared/types'

const NAME_RE = /^[A-Za-z0-9_.-]+$/

function stateFromText(line: string): PrinterState {
  if (/is processing/.test(line) || /now printing/.test(line)) return 'processing'
  if (/is idle/.test(line)) return 'idle'
  if (/disabled/.test(line)) return 'stopped'
  return 'unknown'
}

/** Enumerate configured CUPS queues by combining several lpstat views. */
export async function listPrinters(): Promise<Printer[]> {
  const [pl, v, d, a, p] = await Promise.all([
    run('lpstat', ['-l', '-p']),
    run('lpstat', ['-v']),
    run('lpstat', ['-d']),
    run('lpstat', ['-a']),
    run('lpstat', ['-p'])
  ])

  const printers = new Map<string, Printer>()

  // States + description/location from `lpstat -l -p`.
  let current: string | null = null
  for (const raw of pl.stdout.split('\n')) {
    const m = raw.match(/^printer\s+(\S+)\s+is\s+(.*)$/) ?? raw.match(/^printer\s+(\S+)\s+(disabled.*)$/)
    if (m) {
      current = m[1]
      printers.set(current, {
        name: current,
        state: stateFromText(raw),
        stateReason: m[2]?.replace(/\.$/, '').trim(),
        isDefault: false,
        accepting: true
      })
      continue
    }
    if (current) {
      const desc = raw.match(/^\s+Description:\s*(.*)$/)
      if (desc) printers.get(current)!.description = desc[1].trim()
      const loc = raw.match(/^\s+Location:\s*(.*)$/)
      if (loc) printers.get(current)!.location = loc[1].trim()
    }
  }

  // Fallback: some systems emit fewer detail lines — make sure `-p` names exist.
  for (const raw of p.stdout.split('\n')) {
    const m = raw.match(/^printer\s+(\S+)\s+/)
    if (m && !printers.has(m[1])) {
      printers.set(m[1], { name: m[1], state: stateFromText(raw), isDefault: false, accepting: true })
    }
  }

  // Device URIs.
  for (const raw of v.stdout.split('\n')) {
    const m = raw.match(/^device for (\S+):\s*(.*)$/)
    if (m && printers.has(m[1])) printers.get(m[1])!.deviceUri = m[2].trim()
  }

  // Accepting state.
  for (const raw of a.stdout.split('\n')) {
    const m = raw.match(/^(\S+)\s+(accepting|not accepting)/)
    if (m && printers.has(m[1])) printers.get(m[1])!.accepting = m[2] === 'accepting'
  }

  // Default destination.
  const dm = d.stdout.match(/system default destination:\s*(\S+)/)
  if (dm && printers.has(dm[1])) printers.get(dm[1])!.isDefault = true

  return Array.from(printers.values()).sort((x, y) => x.name.localeCompare(y.name))
}

/** Parse active jobs from `lpstat`. */
export async function listJobs(): Promise<PrintJob[]> {
  const [o, p] = await Promise.all([run('lpstat', ['-W', 'not-completed', '-o']), run('lpstat', ['-p'])])

  const processing = new Set<string>()
  for (const raw of p.stdout.split('\n')) {
    const m = raw.match(/now printing (\S+)-(\d+)/)
    if (m) processing.add(`${m[1]}-${m[2]}`)
  }

  const jobs: PrintJob[] = []
  for (const raw of o.stdout.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // Format: <printer-jobnum>  <user>  <size>  <date...>
    const parts = line.split(/\s+/)
    const id = parts[0]
    const idm = id.match(/^(.*)-(\d+)$/)
    if (!idm) continue
    const printer = idm[1]
    const jobNumber = Number(idm[2])
    const user = parts[1]
    const sizeBytes = Number(parts[2])
    const submittedAt = parts.slice(3).join(' ') || undefined
    jobs.push({
      id,
      printer,
      jobNumber,
      title: id,
      user,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
      submittedAt,
      state: processing.has(id) ? 'processing' : 'pending'
    })
  }
  return jobs
}

export async function cancelJob(jobId: string): Promise<CommandResult> {
  if (!/^[A-Za-z0-9_.-]+$/.test(jobId)) {
    return { ok: false, stdout: '', stderr: `Refused invalid job id "${jobId}".`, code: 1, argv: ['cancel', jobId] }
  }
  return run('cancel', [jobId])
}

export async function cancelAll(printer: string): Promise<CommandResult> {
  if (!NAME_RE.test(printer)) {
    return { ok: false, stdout: '', stderr: `Refused invalid printer "${printer}".`, code: 1, argv: ['cancel', '-a', printer] }
  }
  return run('cancel', ['-a', printer])
}

/** Per-user default — uses lpoptions, which does NOT require admin rights. */
export async function setDefaultPrinter(name: string): Promise<CommandResult> {
  if (!NAME_RE.test(name)) {
    return { ok: false, stdout: '', stderr: `Refused invalid printer "${name}".`, code: 1, argv: ['lpoptions', '-d', name] }
  }
  return run('lpoptions', ['-d', name])
}

/** Submit a print job from a resolved (validated) command. */
export async function submit(resolved: ResolvedCommand): Promise<CommandResult> {
  // Confirm every file exists before we hand it to lp.
  for (const f of resolved.files) {
    try {
      await fs.access(f)
    } catch {
      return { ok: false, stdout: '', stderr: `File not found: ${f}`, code: 1, argv: [resolved.bin, ...resolved.args] }
    }
  }
  return run(resolved.bin, resolved.args, { timeoutMs: 30000 })
}

/**
 * Build the lpadmin argv for adding a queue. Correct driver selection is the
 * caller's job (see chooseDriverStrategy) — this just assembles a validated call.
 */
export function buildAddPrinterCommand(opts: AddPrinterOpts): { bin: string; args: string[]; preview: string; error?: string } {
  const name = opts.name.trim().replace(/\s+/g, '_')
  if (!NAME_RE.test(name)) {
    return { bin: 'lpadmin', args: [], preview: '', error: 'Queue name may only contain letters, numbers, _ . and -' }
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(opts.uri)) {
    return { bin: 'lpadmin', args: [], preview: '', error: 'Device URI must look like lpd://host/, socket://host:9100, ipp://host/… ' }
  }

  const args = ['-p', name, '-E', '-v', opts.uri]
  switch (opts.driver.type) {
    case 'everywhere':
      args.push('-m', 'everywhere')
      break
    case 'ppd':
      args.push('-P', opts.driver.ppdPath)
      break
    case 'model':
      args.push('-m', opts.driver.model)
      break
    case 'raw':
      args.push('-m', 'raw')
      break
  }
  if (opts.location) args.push('-L', opts.location)
  if (opts.description) args.push('-D', opts.description)

  const preview = ['lpadmin', ...args].map((t) => (/^[A-Za-z0-9_./:=,+-]+$/.test(t) ? t : `'${t.replace(/'/g, `'\\''`)}'`)).join(' ')
  return { bin: 'lpadmin', args, preview }
}

export async function addPrinter(opts: AddPrinterOpts): Promise<CommandResult & { hint?: string }> {
  const cmd = buildAddPrinterCommand(opts)
  if (cmd.error) return { ok: false, stdout: '', stderr: cmd.error, code: 1, argv: ['lpadmin'] }
  const res = await run(cmd.bin, cmd.args, { timeoutMs: 20000 })
  if (!res.ok && /not authorized|forbidden|permission|operation was not allowed/i.test(res.stderr)) {
    return {
      ...res,
      hint: `Adding a printer needs admin rights. Run this in Terminal:\n\n  sudo ${cmd.preview}`
    }
  }
  return res
}

/**
 * Decide how to add a printer:
 *  - IPP Everywhere (driverless) ONLY when the device advertises ipp/ipps.
 *  - otherwise a matching installed vendor PPD.
 *  - otherwise no driver found → caller should prompt to install the vendor driver.
 */
export async function chooseDriverStrategy(input: {
  advertisesIpp: boolean
  uri: string
  makeAndModelHint?: string
}): Promise<DriverStrategy> {
  if (input.advertisesIpp && /^ipps?:\/\//i.test(input.uri)) {
    return { recommended: { type: 'everywhere' }, matchingPpds: [], reason: 'Device advertises IPP — driverless (IPP Everywhere) works.' }
  }
  const ppds = await findInstalledPpds(input.makeAndModelHint)
  if (ppds.length > 0) {
    return {
      recommended: { type: 'ppd', ppdPath: ppds[0].path },
      matchingPpds: ppds,
      reason: `No IPP support — using an installed vendor PPD (${ppds[0].label}).`
    }
  }
  return {
    recommended: null,
    matchingPpds: [],
    reason: 'No IPP support and no matching driver installed. Install the vendor CUPS driver, then retry.'
  }
}

const PPD_DIRS = [
  '/Library/Printers/PPDs/Contents/Resources',
  '/System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/PrintCore.framework/Versions/A/Resources'
]

/** Scan installed PPDs and rank by a fuzzy make/model match. */
export async function findInstalledPpds(hint?: string): Promise<PpdEntry[]> {
  const tokens = (hint ?? '').toLowerCase().split(/[\s_-]+/).filter((t) => t.length > 1)
  const out: PpdEntry[] = []
  for (const dir of PPD_DIRS) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const f of entries) {
      if (!/\.ppd(\.gz)?$/i.test(f)) continue
      const label = f.replace(/\.ppd(\.gz)?$/i, '').replace(/\./g, ' ')
      out.push({ path: `${dir}/${f}`, label })
    }
  }
  if (tokens.length === 0) return out.slice(0, 50)
  const scored = out
    .map((e) => {
      const hay = e.label.toLowerCase()
      const score = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0)
      return { e, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((x) => x.e).slice(0, 25)
}

/** List CUPS model drivers (`lpinfo -m`), optionally filtered by a query. */
export async function listModelDrivers(query?: string): Promise<{ model: string; label: string }[]> {
  const res = await run('lpinfo', ['-m'], { timeoutMs: 20000 })
  if (!res.ok) return []
  const q = (query ?? '').toLowerCase()
  const out: { model: string; label: string }[] = []
  for (const raw of res.stdout.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const idx = line.indexOf(' ')
    if (idx < 0) continue
    const model = line.slice(0, idx)
    const label = line.slice(idx + 1)
    if (q && !line.toLowerCase().includes(q)) continue
    out.push({ model, label })
    if (out.length >= 200) break
  }
  return out
}
