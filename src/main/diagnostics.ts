import net from 'node:net'
import os from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { run } from './exec'
import { listPrinters, listJobs } from './cups'
import type { PortProbe, PrinterDiagnostics, ReasonInfo, CommandResult } from '../shared/types'

export const COMMON_PRINT_PORTS: { port: number; label: string }[] = [
  { port: 631, label: 'IPP' },
  { port: 515, label: 'LPD' },
  { port: 9100, label: 'Raw / JetDirect' },
  { port: 80, label: 'HTTP' },
  { port: 443, label: 'HTTPS' }
]

/** TCP connect test with a short timeout. Never throws. */
export function probePort(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

export async function probeHost(host: string, ports = COMMON_PRINT_PORTS): Promise<PortProbe[]> {
  return Promise.all(
    ports.map(async ({ port, label }) => ({ port, label, open: await probePort(host, port) }))
  )
}

/** Pull host + default port out of a CUPS device URI. */
export function parseDeviceUri(uri?: string): { host?: string; port?: number; scheme?: string } {
  if (!uri) return {}
  const m = uri.match(/^([a-z0-9+.-]+):\/\/([^/:]+)(?::(\d+))?/i)
  if (!m) return {}
  const scheme = m[1].toLowerCase()
  const host = m[2]
  const defaultPort =
    scheme === 'lpd' ? 515 : scheme === 'ipp' ? 631 : scheme === 'ipps' ? 443 : scheme === 'socket' ? 9100 : undefined
  return { host, port: m[3] ? Number(m[3]) : defaultPort, scheme }
}

const REASON_MAP: { match: RegExp; label: string; severity: ReasonInfo['severity'] }[] = [
  { match: /media[-\s]?(empty|needed)|no paper|out of paper/i, label: 'Out of paper', severity: 'warn' },
  { match: /media[-\s]?jam|paper[-\s]?jam|jam/i, label: 'Paper jam', severity: 'error' },
  { match: /marker[-\s]?supply[-\s]?empty|toner[-\s]?empty|out of ink|ink[-\s]?empty/i, label: 'Out of ink / toner', severity: 'error' },
  { match: /marker[-\s]?supply[-\s]?low|toner[-\s]?low|ink[-\s]?low/i, label: 'Ink / toner low', severity: 'warn' },
  { match: /cover[-\s]?open/i, label: 'Cover open', severity: 'warn' },
  { match: /door[-\s]?open/i, label: 'Door open', severity: 'warn' },
  { match: /offline|not responding|unreachable/i, label: 'Printer offline / not responding', severity: 'error' },
  { match: /connecting[-\s]?to[-\s]?device|connecting/i, label: 'Connecting to printer…', severity: 'info' },
  { match: /timed[-\s]?out|timeout/i, label: 'Connection timed out', severity: 'error' },
  { match: /paused|stopped|disabled/i, label: 'Queue paused', severity: 'warn' },
  { match: /shutdown|powered off/i, label: 'Powered off', severity: 'error' },
  { match: /rejecting|not accepting/i, label: 'Not accepting new jobs', severity: 'warn' }
]

function classifyReason(text: string): ReasonInfo | null {
  const t = text.trim()
  if (!t || /^ready$/i.test(t) || /accepting requests/i.test(t)) return null
  for (const r of REASON_MAP) {
    if (r.match.test(t)) return { code: t, label: r.label, severity: r.severity }
  }
  return { code: t, label: t.replace(/\.$/, ''), severity: 'warn' }
}

/** Collect the free-text reason lines CUPS reports for a printer. */
async function collectReasons(name: string): Promise<ReasonInfo[]> {
  const res = await run('lpstat', ['-l', '-p', name])
  const out: ReasonInfo[] = []
  const seen = new Set<string>()
  for (const raw of res.stdout.split('\n')) {
    // The header line often carries the reason after "disabled since … -" or "is …".
    const header = raw.match(/^printer\s+\S+\s+(?:is\s+)?(.*)$/)
    const indented = raw.match(/^\s+(.*)$/)
    let text: string | undefined
    if (header && / - /.test(raw)) text = raw.split(' - ').slice(1).join(' - ')
    else if (indented && !/^\s+(Description|Location|Connection|Interface|On fault|After fault|Users|Forms|Content|Printer types|Default|Charset|Job Sheet|Banner|Reason):/i.test(raw))
      text = indented[1]
    if (!text) continue
    const info = classifyReason(text)
    if (info && !seen.has(info.label)) {
      seen.add(info.label)
      out.push(info)
    }
  }
  return out
}

export async function diagnose(name: string): Promise<PrinterDiagnostics> {
  const [printers, jobs, reasons] = await Promise.all([listPrinters(), listJobs(), collectReasons(name)])
  const printer = printers.find((p) => p.name === name)
  const { host, port, scheme } = parseDeviceUri(printer?.deviceUri)

  let ports: PortProbe[] = []
  let reachable: boolean | undefined
  if (host) {
    // Probe the device's own port first, then the common set (deduped).
    const portSet = [...COMMON_PRINT_PORTS]
    if (port && !portSet.some((p) => p.port === port)) portSet.unshift({ port, label: scheme?.toUpperCase() ?? 'Device' })
    ports = await probeHost(host, portSet)
    reachable = ports.some((p) => p.open)
  }

  const jobCount = jobs.filter((j) => j.printer === name).length
  const state = printer?.state ?? 'unknown'

  const summaryParts = [
    `Printer "${name}" state=${state}, accepting=${printer?.accepting ?? 'unknown'}.`,
    printer?.deviceUri ? `Device URI: ${printer.deviceUri}.` : 'No device URI.',
    host ? `Host ${host} reachable=${reachable} (open ports: ${ports.filter((p) => p.open).map((p) => p.port).join(', ') || 'none'}).` : '',
    reasons.length ? `Reasons: ${reasons.map((r) => r.label).join('; ')}.` : 'No error reasons reported.',
    `${jobCount} job(s) queued.`
  ].filter(Boolean)

  return {
    name,
    state,
    accepting: printer?.accepting ?? false,
    deviceUri: printer?.deviceUri,
    host,
    reachable,
    ports,
    reasons,
    jobs: jobCount,
    summary: summaryParts.join(' ')
  }
}

// ---- Quick fixes ----

const NAME_RE = /^[A-Za-z0-9_.-]+$/

async function adminCommand(bin: string, args: string[], name: string) {
  if (!NAME_RE.test(name)) return { ok: false, stdout: '', stderr: `Refused invalid printer "${name}".`, code: 1, argv: [bin, ...args] }
  const res = await run(bin, args)
  if (!res.ok && /not authorized|forbidden|permission|not allowed/i.test(res.stderr)) {
    return { ...res, hint: `This needs admin rights. Run in Terminal:\n\n  sudo ${bin} ${args.join(' ')}` }
  }
  return res
}

export const enablePrinter = (name: string) => adminCommand('cupsenable', [name], name)
export const acceptJobs = (name: string) => adminCommand('cupsaccept', [name], name)
export const removePrinter = (name: string) => adminCommand('lpadmin', ['-x', name], name)

/** Physically print a small test page to confirm the connection works. */
export async function printTestPage(name: string): Promise<CommandResult> {
  if (!NAME_RE.test(name)) return { ok: false, stdout: '', stderr: `Refused invalid printer "${name}".`, code: 1, argv: ['lp'] }
  const file = join(os.tmpdir(), `cfp-test-${Date.now()}.txt`)
  const body = [
    '  Printer Use — test page',
    '  ================================',
    '',
    `  Printer : ${name}`,
    `  Time    : ${new Date().toString()}`,
    '',
    '  If you can read this, the connection works. 🎉',
    ''
  ].join('\n')
  await fs.writeFile(file, body, 'utf8')
  const res = await run('lp', ['-d', name, '-t', 'CFP Test Page', file], { timeoutMs: 20000 })
  fs.unlink(file).catch(() => {})
  return res
}

/** Prompt for the user's engine to diagnose a printer problem in plain English. */
export function buildDiagnosisPrompt(diag: PrinterDiagnostics): string {
  const isCanonG = /canon.*g\d{3,4}|pixma_g/i.test(diag.name) || /192\.168/.test(diag.deviceUri ?? '')
  const canonNote = isCanonG
    ? `\nKnown context (Canon PIXMA G-series): alternating green+orange status lamps mean an internal fault; the orange blink count identifies it — 2 = carriage jam, 7 = waste ink absorber full, 10 = hardware fault. A "5100" service error is a carriage/paper obstruction that usually clears with a power-cycle after removing any jam.`
    : ''
  return `You are a printing/CUPS troubleshooting assistant on macOS. Given the diagnostics below, explain in plain English what is most likely wrong and give a short, ordered list of concrete fixes (both physical steps and macOS/CUPS commands like cupsenable, cupsaccept, cancel -a, lpadmin). Be concise (max ~120 words). Do not invent facts not supported by the data.

DIAGNOSTICS:
${diag.summary}
Raw reasons: ${diag.reasons.map((r) => `${r.label} [${r.severity}]`).join('; ') || 'none'}
Reachable: ${diag.reachable == null ? 'unknown' : diag.reachable}
Open ports: ${diag.ports.filter((p) => p.open).map((p) => `${p.port}(${p.label})`).join(', ') || 'none'}${canonNote}

Respond as plain text (no markdown headers).`
}
