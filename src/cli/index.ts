/**
 * printer-use CLI: the same pipeline as the desktop app, for terminals and agents.
 *
 *   natural language → your AI engine → whitelisted options → deterministic `lp` argv → you approve → print
 *
 * The CLI shares src/main (CUPS, discovery, diagnostics, NL translation, lp builder)
 * with the Electron app. Nothing here imports Electron.
 */
import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { BUILT_IN_PROVIDERS } from '../shared/providers'
import { resolveAvailability } from '../main/providers'
import { listPrinters, listJobs, cancelJob, submit, setDefaultPrinter } from '../main/cups'
import { discoverPrinters } from '../main/discovery'
import { diagnose } from '../main/diagnostics'
import { translate } from '../main/nl'
import { buildLpCommand } from '../main/lp-builder'
import type { Provider, ResolvedCommand } from '../shared/types'

const VERSION = '0.1.0'

const HELP = `printer-use ${VERSION}: let your agent use your printer.

Usage
  printer-use print <file...> ["request"]   Translate a request into an lp command, confirm, print
  printer-use printers                      List CUPS printers
  printer-use jobs                          List active print jobs
  printer-use cancel <job-id>               Cancel a job (e.g. Canon_G3000-42)
  printer-use default <printer>             Set your default printer (per user, no sudo)
  printer-use discover                      Find printers on the network (Bonjour/mDNS)
  printer-use diagnose <printer>            Reachability, CUPS state reasons, queue depth
  printer-use engines                       Show which AI engines are installed

Options
  -p, --printer <name>   Target printer (overrides the engine's choice)
  -e, --engine <id>      claude-code | codex | grok (default: first installed, or $PRINTER_USE_ENGINE)
  -n, --dry-run          Show the resolved command, do not print
  -y, --yes              Print without asking for confirmation
      --json             Machine-readable output (for agents)
  -h, --help             Show this help
  -v, --version          Show the version

Examples
  printer-use print report.pdf "2 copies, double-sided, black and white, pages 1-3"
  printer-use print slides.pdf "4 per page, landscape" --dry-run --json
`

type Flags = {
  printer?: string
  engine?: string
  'dry-run'?: boolean
  yes?: boolean
  json?: boolean
  help?: boolean
  version?: boolean
}

function out(json: boolean, data: unknown, text: string): void {
  process.stdout.write(json ? JSON.stringify(data, null, 2) + '\n' : text.endsWith('\n') ? text : text + '\n')
}

function fail(json: boolean, message: string, extra: Record<string, unknown> = {}): never {
  if (json) process.stdout.write(JSON.stringify({ ok: false, error: message, ...extra }, null, 2) + '\n')
  else process.stderr.write(`printer-use: ${message}\n`)
  process.exit(1)
}

async function pickEngine(id: string | undefined, json: boolean): Promise<Provider> {
  const engines = await resolveAvailability(BUILT_IN_PROVIDERS)
  const wanted = id ?? process.env.PRINTER_USE_ENGINE
  if (wanted) {
    const match = engines.find((e) => e.id === wanted || e.bin === wanted)
    if (!match) fail(json, `Unknown engine "${wanted}". Use one of: ${engines.map((e) => e.id).join(', ')}`)
    if (!match.available) fail(json, `Engine "${match.id}" is not installed (looked for \`${match.bin}\` on PATH).`)
    return match
  }
  const first = engines.find((e) => e.available)
  if (!first) fail(json, 'No AI engine found on PATH. Install Claude Code, Codex or Grok CLI, or omit the request to print with defaults.')
  return first
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(question)).trim().toLowerCase()
  rl.close()
  return answer === 'y' || answer === 'yes'
}

async function cmdPrint(positionals: string[], flags: Flags): Promise<void> {
  const json = !!flags.json
  if (!positionals.length) fail(json, 'print needs at least one file. See `printer-use --help`.')

  // Everything that exists on disk is a file; a trailing non-file argument is the request.
  const last = positionals[positionals.length - 1]
  const hasRequest = positionals.length > 1 && !existsSync(last)
  const request = hasRequest ? last : ''
  const files = (hasRequest ? positionals.slice(0, -1) : positionals).map((f) => resolve(f))
  const missing = files.filter((f) => !existsSync(f))
  if (missing.length) fail(json, `File not found: ${missing.join(', ')}`)

  const printers = await listPrinters()
  const defaultPrinter = printers.find((p) => p.isDefault)?.name
  if (flags.printer && !printers.some((p) => p.name === flags.printer)) {
    fail(json, `No printer named "${flags.printer}". Run \`printer-use printers\` to see the list.`)
  }

  let resolved: ResolvedCommand
  let summary = 'Print with default settings.'
  let notes: string | undefined
  let engineId: string | undefined

  if (request) {
    const engine = await pickEngine(flags.engine, json)
    engineId = engine.id
    if (!json) process.stderr.write(`Asking ${engine.name}…\n`)
    const result = await translate(engine, { userText: request, files, printers, defaultPrinter, targetPrinter: flags.printer })
    if (!result.ok || !result.resolved) fail(json, result.error ?? 'Could not translate the request.', { raw: result.raw })
    resolved = result.resolved
    summary = result.interpretation?.summary ?? summary
    notes = result.interpretation?.notes
  } else {
    resolved = buildLpCommand({ printer: flags.printer ?? defaultPrinter }, files)
  }

  const plan = { summary, notes, engine: engineId, command: resolved.preview, argv: [resolved.bin, ...resolved.args], applied: resolved.applied, warnings: resolved.warnings }

  if (flags['dry-run']) {
    out(json, { ok: true, dryRun: true, ...plan }, renderPlan(plan))
    return
  }

  if (!flags.yes) {
    if (json || !process.stdin.isTTY) {
      fail(json, 'Refusing to print without confirmation. Re-run with --yes, or use --dry-run to preview.', plan)
    }
    process.stdout.write(renderPlan(plan) + '\n')
    if (!(await confirm('Print this? [y/N] '))) {
      process.stdout.write('Cancelled. Nothing was sent to the printer.\n')
      return
    }
  }

  const res = await submit(resolved)
  if (!res.ok) fail(json, res.stderr.trim() || `lp exited with code ${res.code}`, plan)
  out(json, { ok: true, ...plan, output: res.stdout.trim() }, res.stdout.trim() || 'Sent to the printer.')
}

function renderPlan(plan: { summary: string; notes?: string; command: string; warnings: string[] }): string {
  const lines = [plan.summary, '', `  ${plan.command}`]
  if (plan.notes) lines.push('', `Note: ${plan.notes}`)
  for (const w of plan.warnings) lines.push(`Warning: ${w}`)
  return lines.join('\n')
}

async function main(): Promise<void> {
  let parsed
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        printer: { type: 'string', short: 'p' },
        engine: { type: 'string', short: 'e' },
        'dry-run': { type: 'boolean', short: 'n' },
        yes: { type: 'boolean', short: 'y' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' }
      }
    })
  } catch (err) {
    fail(false, (err as Error).message)
  }
  const flags = parsed.values as Flags
  const [command, ...rest] = parsed.positionals
  const json = !!flags.json

  if (flags.version) return out(json, { version: VERSION }, VERSION)
  if (flags.help || !command) return out(false, null, HELP)

  switch (command) {
    case 'print':
      return cmdPrint(rest, flags)
    case 'printers': {
      const printers = await listPrinters()
      const text = printers.length
        ? printers.map((p) => `${p.isDefault ? '*' : ' '} ${p.name}  ${p.state}${p.accepting ? '' : ' (not accepting jobs)'}${p.deviceUri ? `  ${p.deviceUri}` : ''}`).join('\n')
        : 'No printers configured. Try `printer-use discover`.'
      return out(json, printers, text)
    }
    case 'jobs': {
      const jobs = await listJobs()
      const text = jobs.length ? jobs.map((j) => `${j.id}  ${j.state}  ${j.title}`).join('\n') : 'No active jobs.'
      return out(json, jobs, text)
    }
    case 'cancel': {
      if (!rest[0]) fail(json, 'cancel needs a job id. Run `printer-use jobs` to see them.')
      const res = await cancelJob(rest[0])
      if (!res.ok) fail(json, res.stderr.trim() || 'cancel failed')
      return out(json, { ok: true, job: rest[0] }, `Cancelled ${rest[0]}.`)
    }
    case 'default': {
      if (!rest[0]) fail(json, 'default needs a printer name.')
      const res = await setDefaultPrinter(rest[0])
      if (!res.ok) fail(json, res.stderr.trim() || 'lpoptions failed')
      return out(json, { ok: true, printer: rest[0] }, `Default printer is now ${rest[0]}.`)
    }
    case 'discover': {
      if (!json) process.stderr.write('Scanning the network…\n')
      const devices = await discoverPrinters()
      const text = devices.length
        ? devices.map((d) => `${d.name}  ${d.serviceType}${d.suggestedUri ? `  ${d.suggestedUri}` : ''}${d.alreadyAdded ? '  (added)' : ''}`).join('\n')
        : 'No printers found on the network.'
      return out(json, devices, text)
    }
    case 'diagnose': {
      if (!rest[0]) fail(json, 'diagnose needs a printer name.')
      const d = await diagnose(rest[0])
      const lines = [
        d.summary,
        `State: ${d.state}${d.accepting ? '' : ', not accepting jobs'}`,
        `Queue: ${d.jobs} job(s)`,
        ...(d.host ? [`Host: ${d.host} (${d.reachable ? 'reachable' : 'unreachable'})`] : []),
        ...d.ports.map((p) => `  port ${p.port} ${p.label}: ${p.open ? 'open' : 'closed'}`),
        ...d.reasons.map((r) => `  ${r.severity}: ${r.label}`)
      ]
      return out(json, d, lines.join('\n'))
    }
    case 'engines': {
      const engines = await resolveAvailability(BUILT_IN_PROVIDERS)
      const text = engines.map((e) => `${e.available ? '✓' : '·'} ${e.id.padEnd(12)} ${e.name}${e.resolvedPath ? `  ${e.resolvedPath}` : ''}`).join('\n')
      return out(json, engines.map(({ id, name, bin, available, resolvedPath }) => ({ id, name, bin, available, resolvedPath })), text)
    }
    default:
      fail(json, `Unknown command "${command}". See \`printer-use --help\`.`)
  }
}

main().catch((err) => fail(false, (err as Error)?.message ?? String(err)))
