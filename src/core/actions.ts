/**
 * High-level printer actions shared by the CLI and the MCP server.
 * No Electron imports. Every command is validated and run as an argv array.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { listPrinters, cancelAll, chooseDriverStrategy, buildAddPrinterCommand, addPrinter } from '../main/cups'
import { diagnose, probeHost, enablePrinter, acceptJobs } from '../main/diagnostics'
import { buildLpCommand } from '../main/lp-builder'
import type { PrintOptions, ResolvedCommand, DriverChoice, PrinterDiagnostics } from '../shared/types'

export interface PrintPlanResult {
  ok: boolean
  error?: string
  resolved?: ResolvedCommand
}

/**
 * Build an `lp` command from explicit options. Fills in the default printer.
 * With `strict` (the default), any option that fails validation is an error rather
 * than being dropped, so an agent never prints something other than what it asked for.
 */
export async function planPrint(filePaths: string[], options: PrintOptions, strict = true): Promise<PrintPlanResult> {
  if (!filePaths.length) return { ok: false, error: 'No files given.' }
  const files = filePaths.map((f) => resolve(f))
  const missing = files.filter((f) => !existsSync(f))
  if (missing.length) return { ok: false, error: `File not found: ${missing.join(', ')}` }

  const printers = await listPrinters()
  const printer = options.printer ?? printers.find((p) => p.isDefault)?.name
  if (!printer) return { ok: false, error: 'No printer given and no default printer set. Run `printer-use printers`.' }
  if (!printers.some((p) => p.name === printer)) {
    return { ok: false, error: `No printer named "${printer}". Known printers: ${printers.map((p) => p.name).join(', ') || 'none'}.` }
  }
  const resolved = buildLpCommand({ ...options, printer }, files)
  if (strict && resolved.warnings.length) return { ok: false, error: resolved.warnings.join(' '), resolved }
  return { ok: true, resolved }
}

export interface SetupPlan {
  ok: boolean
  error?: string
  name?: string
  uri?: string
  driver?: DriverChoice
  reason?: string
  command?: string
  openPorts: number[]
}

function defaultQueueName(host: string, model?: string): string {
  const base = (model || `Printer_${host}`).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
  return base || 'Printer'
}

/**
 * Work out how to add a network printer at `host`:
 *  - IPP (port 631) open → driverless IPP Everywhere.
 *  - otherwise LPD (515) or raw socket (9100) with a matching installed vendor driver.
 * Agents commonly get this wrong by using IPP Everywhere on printers that don't speak IPP.
 */
export async function planSetup(input: { host: string; name?: string; model?: string }): Promise<SetupPlan> {
  const host = input.host.trim()
  if (!/^[A-Za-z0-9.:-]+$/.test(host)) return { ok: false, error: `"${host}" is not a valid host or IP address.`, openPorts: [] }
  if (/^(localhost|127\.|::1$|0\.0\.0\.0$)/i.test(host)) {
    return { ok: false, error: `${host} is this computer, not a printer. Use the printer's own IP address (see \`printer-use discover\`).`, openPorts: [] }
  }

  const probes = await probeHost(host)
  const openPorts = probes.filter((p) => p.open).map((p) => p.port)
  if (!openPorts.length) {
    return { ok: false, error: `Nothing answered at ${host} on the usual print ports (631, 515, 9100). Is the printer on and on this network?`, openPorts }
  }

  const ipp = openPorts.includes(631)
  const uri = ipp ? `ipp://${host}/ipp/print` : openPorts.includes(515) ? `lpd://${host}/` : openPorts.includes(9100) ? `socket://${host}:9100` : undefined
  if (!uri) {
    return { ok: false, error: `${host} answers on ${openPorts.join(', ')} but none of them are print ports (631, 515, 9100).`, openPorts }
  }

  const strategy = await chooseDriverStrategy({ advertisesIpp: ipp, uri, makeAndModelHint: input.model })
  if (!strategy.recommended) {
    return { ok: false, error: strategy.reason + (input.model ? '' : ' Pass the printer model (for example "Canon G3000") so a driver can be matched.'), uri, reason: strategy.reason, openPorts }
  }

  const name = input.name ?? defaultQueueName(host, input.model)
  const cmd = buildAddPrinterCommand({ name, uri, driver: strategy.recommended })
  if (cmd.error) return { ok: false, error: cmd.error, openPorts }
  return { ok: true, name, uri, driver: strategy.recommended, reason: strategy.reason, command: cmd.preview, openPorts }
}

export async function runSetup(plan: SetupPlan) {
  if (!plan.ok || !plan.name || !plan.uri || !plan.driver) return { ok: false, error: plan.error ?? 'Nothing to set up.' }
  const res = await addPrinter({ name: plan.name, uri: plan.uri, driver: plan.driver })
  return res.ok
    ? { ok: true, printer: plan.name, command: plan.command }
    : { ok: false, error: res.stderr.trim() || `lpadmin exited with code ${res.code}`, hint: res.hint, command: plan.command }
}

export interface FixResult {
  ok: boolean
  printer: string
  before: PrinterDiagnostics
  actions: { action: string; ok: boolean; detail?: string; hint?: string }[]
  after: PrinterDiagnostics
  remaining: string[]
}

/**
 * Apply the safe software fixes: resume a stopped printer, re-enable job acceptance,
 * and optionally clear the queue. Physical problems (paper, ink, jams) are reported
 * back so a person can deal with them.
 */
export async function fixPrinter(name: string, opts: { clearQueue?: boolean } = {}): Promise<FixResult> {
  const before = await diagnose(name)
  const actions: FixResult['actions'] = []

  if (opts.clearQueue && before.jobs > 0) {
    const r = await cancelAll(name)
    actions.push({ action: `Cleared ${before.jobs} job(s) from the queue`, ok: r.ok, detail: r.ok ? undefined : r.stderr.trim() })
  }
  if (before.state === 'stopped') {
    const r = await enablePrinter(name)
    actions.push({ action: 'Resumed the printer (cupsenable)', ok: r.ok, detail: r.ok ? undefined : r.stderr.trim(), hint: (r as { hint?: string }).hint })
  }
  if (!before.accepting) {
    const r = await acceptJobs(name)
    actions.push({ action: 'Turned job acceptance back on (cupsaccept)', ok: r.ok, detail: r.ok ? undefined : r.stderr.trim(), hint: (r as { hint?: string }).hint })
  }

  const after = await diagnose(name)
  const remaining = [
    ...after.reasons.filter((r) => r.severity !== 'info').map((r) => r.label),
    ...(after.reachable === false ? [`The printer at ${after.host} is not answering on the network`] : [])
  ]
  return { ok: actions.every((a) => a.ok), printer: name, before, actions, after, remaining }
}
