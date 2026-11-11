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
import { printTestPage } from '../main/diagnostics'
import { planPrint, planSetup, runSetup, fixPrinter } from '../core/actions'
import type { Provider, ResolvedCommand, PrintOptions } from '../shared/types'

const VERSION = '0.2.0'

const HELP = `printer-use ${VERSION}: printer setup, repair and printing, with guardrails.

Usage
  printer-use print <file...> [options]     Print with explicit options (no AI involved)
  printer-use print <file...> "request"     Or describe the job; your AI engine picks the options
  printer-use setup <ip-or-host>            Add a network printer with the right protocol and driver
  printer-use fix <printer>                 Resume, re-enable, and report what a person must fix
  printer-use diagnose <printer>            Reachability, CUPS state reasons, queue depth
  printer-use test-page <printer>           Print a one-page test sheet
  printer-use printers                      List printers (* marks the default)
  printer-use jobs                          List active print jobs
  printer-use cancel <job-id>               Cancel a job (e.g. Canon_G3000-42)
  printer-use default <printer>             Set your default printer (per user, no sudo)
  printer-use discover                      Find printers on the network (Bonjour/mDNS)
  printer-use engines                       Show which AI engines are installed
  printer-use mcp                           Run as an MCP server over stdio

Print options
      --copies <n>        1 to 999
      --duplex            Double-sided (long edge). --duplex-short for short edge
      --mono | --color    Black and white, or color
      --quality <q>       draft | normal | high
      --landscape         Landscape orientation
      --media <size>      A4, Letter, Legal, …
      --pages <ranges>    e.g. 1-3,7
      --per-sheet <n>     Pages per sheet: 1, 2, 4, 6, 9, 16
      --fit               Fit to page
      --collate           Collate copies

Setup and fix options
      --model <name>      Printer make and model, used to match a driver (setup)
      --name <queue>      Queue name to create (setup)
      --clear-queue       Also cancel stuck jobs (fix)

General options
  -p, --printer <name>   Target printer
  -e, --engine <id>      claude-code | codex | grok (default: first installed, or $PRINTER_USE_ENGINE)
  -n, --dry-run          Show the command, change nothing
  -y, --yes              Do it without asking
      --json             Machine-readable output (for agents)
  -h, --help             Show this help
  -v, --version          Show the version

Examples
  printer-use print report.pdf --copies 2 --duplex --mono --pages 1-3
  printer-use print report.pdf "2 copies, double-sided, black and white"
  printer-use setup 192.168.1.20 --model "Canon G3000"
  printer-use fix Canon_PIXMA_G3000 --clear-queue
`

type Flags = {
  printer?: string
  copies?: string
  duplex?: boolean
  'duplex-short'?: boolean
  mono?: boolean
  color?: boolean
  quality?: string
  landscape?: boolean
  media?: string
  pages?: string
  'per-sheet'?: string
  fit?: boolean
  collate?: boolean
  model?: string
  name?: string
  'clear-queue'?: boolean
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

/** Print options given directly on the command line. Undefined when none were given. */
function flagOptions(f: Flags): PrintOptions | undefined {
  const o: PrintOptions = {}
  if (f.copies != null) o.copies = Number(f.copies)
  if (f.duplex) o.sides = 'two-sided-long-edge'
  if (f['duplex-short']) o.sides = 'two-sided-short-edge'
  if (f.mono) o.color = 'monochrome'
  if (f.color) o.color = 'color'
  if (f.quality) o.quality = f.quality as PrintOptions['quality']
  if (f.landscape) o.orientation = 'landscape'
  if (f.media) o.media = f.media
  if (f.pages) o.pageRanges = f.pages
  if (f['per-sheet'] != null) o.numberUp = Number(f['per-sheet'])
  if (f.fit) o.fitToPage = true
  if (f.collate) o.collate = true
  return Object.keys(o).length ? o : undefined
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
  let summary = 'Print with the options given.'
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
    // Explicit flags win over the engine's reading of the request.
    const explicit = flagOptions(flags)
    if (explicit) {
      const plan = await planPrint(files, { ...resolved.applied, ...explicit })
      if (!plan.ok || !plan.resolved) fail(json, plan.error ?? 'Could not build the command.')
      resolved = plan.resolved
    }
  } else {
    const plan = await planPrint(files, { ...flagOptions(flags), printer: flags.printer })
    if (!plan.ok || !plan.resolved) fail(json, plan.error ?? 'Could not build the command.')
    resolved = plan.resolved
    summary = 'Print with the options given.'
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

async function cmdSetup(positionals: string[], flags: Flags): Promise<void> {
  const json = !!flags.json
  if (!positionals[0]) fail(json, 'setup needs an IP address or hostname, e.g. `printer-use setup 192.168.1.20 --model "Canon G3000"`.')
  if (!json) process.stderr.write(`Checking ${positionals[0]}…\n`)
  const plan = await planSetup({ host: positionals[0], model: flags.model, name: flags.name })
  if (!plan.ok) fail(json, plan.error ?? 'Could not plan the setup.', { openPorts: plan.openPorts })
  const text = [plan.reason ?? '', '', `  ${plan.command}`].join('\n')
  if (flags['dry-run']) return out(json, { dryRun: true, ...plan }, text)
  if (!flags.yes) {
    if (json || !process.stdin.isTTY) fail(json, 'Refusing to add a printer without confirmation. Re-run with --yes, or use --dry-run.', { ...plan })
    process.stdout.write(text + '\n')
    if (!(await confirm('Add this printer? [y/N] '))) return out(false, null, 'Cancelled. Nothing was changed.')
  }
  const res = await runSetup(plan)
  if (!res.ok) fail(json, [res.error, (res as { hint?: string }).hint].filter(Boolean).join('\n\n'), res)
  out(json, res, `Added ${plan.name}. Try \`printer-use test-page ${plan.name}\`.`)
}

async function cmdFix(positionals: string[], flags: Flags): Promise<void> {
  const json = !!flags.json
  const name = positionals[0]
  if (!name) fail(json, 'fix needs a printer name. Run `printer-use printers` to see them.')
  if (flags['dry-run']) {
    const { diagnose } = await import('../main/diagnostics')
    const d = await diagnose(name)
    const would = [
      ...(flags['clear-queue'] && d.jobs ? [`clear ${d.jobs} job(s)`] : []),
      ...(d.state === 'stopped' ? ['resume the printer'] : []),
      ...(!d.accepting ? ['turn job acceptance back on'] : [])
    ]
    return out(json, { dryRun: true, wouldDo: would, diagnostics: d }, would.length ? `Would ${would.join(', ')}.` : 'Nothing to fix in software.')
  }
  const res = await fixPrinter(name, { clearQueue: flags['clear-queue'] })
  const lines = [
    ...(res.actions.length ? res.actions.map((a) => `${a.ok ? '✓' : '✗'} ${a.action}${a.detail ? `: ${a.detail}` : ''}${a.hint ? `\n${a.hint}` : ''}`) : ['Nothing to fix in software.']),
    ...(res.remaining.length ? ['', 'Needs a person:', ...res.remaining.map((r) => `  • ${r}`)] : []),
    '',
    `Now: ${res.after.state}${res.after.accepting ? '' : ', not accepting jobs'}, ${res.after.jobs} job(s) queued.`
  ]
  if (json) return out(true, res, '')
  out(false, null, lines.join('\n'))
  if (!res.ok) process.exit(1)
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
        copies: { type: 'string' },
        duplex: { type: 'boolean' },
        'duplex-short': { type: 'boolean' },
        mono: { type: 'boolean' },
        color: { type: 'boolean' },
        quality: { type: 'string' },
        landscape: { type: 'boolean' },
        media: { type: 'string' },
        pages: { type: 'string' },
        'per-sheet': { type: 'string' },
        fit: { type: 'boolean' },
        collate: { type: 'boolean' },
        model: { type: 'string' },
        name: { type: 'string' },
        'clear-queue': { type: 'boolean' },
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
    case 'mcp': {
      const { startMcpServer } = await import('./mcp')
      return startMcpServer(VERSION)
    }
    case 'setup':
      return cmdSetup(rest, flags)
    case 'fix':
      return cmdFix(rest, flags)
    case 'test-page': {
      if (!rest[0]) fail(json, 'test-page needs a printer name.')
      if (!flags.yes && !(await confirm(`Print a test page on ${rest[0]}? [y/N] `))) {
        fail(json, 'Not confirmed. Re-run with --yes to print the test page.')
      }
      const res = await printTestPage(rest[0])
      if (!res.ok) fail(json, res.stderr.trim() || 'lp failed')
      return out(json, { ok: true, printer: rest[0] }, `Test page sent to ${rest[0]}.`)
    }
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
