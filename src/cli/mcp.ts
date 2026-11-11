/**
 * printer-use MCP server (stdio). Started with `printer-use mcp`.
 *
 * Read-only tools are marked readOnlyHint so clients can run them freely.
 * Anything that prints, changes a printer or clears a queue is marked destructive,
 * so the client asks the person first. Printing always has a separate preview tool.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { listPrinters, listJobs, cancelJob, setDefaultPrinter, submit } from '../main/cups'
import { discoverPrinters } from '../main/discovery'
import { diagnose, printTestPage } from '../main/diagnostics'
import { planPrint, planSetup, runSetup, fixPrinter } from '../core/actions'
import type { PrintOptions } from '../shared/types'

const READ = { readOnlyHint: true, openWorldHint: false } as const
const CHANGE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const

function result(data: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], isError }
}

const printShape = {
  files: z.array(z.string()).min(1).describe('Absolute paths of the files to print'),
  printer: z.string().optional().describe('CUPS queue name. Defaults to the default printer'),
  copies: z.number().int().min(1).max(999).optional(),
  sides: z.enum(['one-sided', 'two-sided-long-edge', 'two-sided-short-edge']).optional().describe('two-sided-long-edge is normal double-sided'),
  color: z.enum(['color', 'monochrome']).optional(),
  quality: z.enum(['draft', 'normal', 'high']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  media: z.string().optional().describe('Paper size, e.g. A4, Letter, Legal'),
  page_ranges: z.string().optional().describe('e.g. "1-3,7"'),
  pages_per_sheet: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(9), z.literal(16)]).optional(),
  collate: z.boolean().optional(),
  fit_to_page: z.boolean().optional()
}

type PrintArgs = { [K in keyof typeof printShape]: z.infer<(typeof printShape)[K]> }

function toOptions(a: PrintArgs): PrintOptions {
  return {
    printer: a.printer,
    copies: a.copies,
    sides: a.sides,
    color: a.color,
    quality: a.quality,
    orientation: a.orientation,
    media: a.media,
    pageRanges: a.page_ranges,
    numberUp: a.pages_per_sheet,
    collate: a.collate,
    fitToPage: a.fit_to_page
  }
}

export async function startMcpServer(version: string): Promise<void> {
  const server = new McpServer({ name: 'printer-use', version })

  server.registerTool('list_printers', { description: 'List the printers set up on this computer, with state and which one is the default.', annotations: READ }, async () =>
    result(await listPrinters())
  )

  server.registerTool('list_jobs', { description: 'List print jobs that have not finished yet.', annotations: READ }, async () => result(await listJobs()))

  server.registerTool(
    'discover_printers',
    { description: 'Find printers on the local network over Bonjour/mDNS, including ones not set up yet.', annotations: READ },
    async () => result(await discoverPrinters())
  )

  server.registerTool(
    'diagnose_printer',
    {
      description: 'Check why a printer is not working: network reachability per port, CUPS state reasons in plain English (paper jam, out of ink, offline, paused), and queue depth.',
      inputSchema: { printer: z.string() },
      annotations: READ
    },
    async ({ printer }) => result(await diagnose(printer))
  )

  server.registerTool(
    'preview_print',
    {
      description: 'Build the exact lp command for a print job without printing. Always call this first and show the command to the person before calling print_file.',
      inputSchema: printShape,
      annotations: READ
    },
    async (args) => {
      const plan = await planPrint(args.files, toOptions(args as PrintArgs))
      if (!plan.ok || !plan.resolved) return result({ ok: false, error: plan.error }, true)
      const r = plan.resolved
      return result({ ok: true, command: r.preview, applied: r.applied, warnings: r.warnings })
    }
  )

  server.registerTool(
    'print_file',
    { description: 'Print files. Only call after preview_print and after the person has agreed.', inputSchema: printShape, annotations: CHANGE },
    async (args) => {
      const plan = await planPrint(args.files, toOptions(args as PrintArgs))
      if (!plan.ok || !plan.resolved) return result({ ok: false, error: plan.error }, true)
      const res = await submit(plan.resolved)
      return result({ ok: res.ok, command: plan.resolved.preview, output: res.stdout.trim(), error: res.ok ? undefined : res.stderr.trim() }, !res.ok)
    }
  )

  server.registerTool(
    'cancel_job',
    { description: 'Cancel one print job by id, e.g. "Canon_G3000-42".', inputSchema: { job_id: z.string() }, annotations: CHANGE },
    async ({ job_id }) => {
      const res = await cancelJob(job_id)
      return result({ ok: res.ok, error: res.ok ? undefined : res.stderr.trim() }, !res.ok)
    }
  )

  server.registerTool(
    'set_default_printer',
    { description: 'Set the default printer for this user. Needs no admin rights.', inputSchema: { printer: z.string() }, annotations: CHANGE },
    async ({ printer }) => {
      const res = await setDefaultPrinter(printer)
      return result({ ok: res.ok, error: res.ok ? undefined : res.stderr.trim() }, !res.ok)
    }
  )

  server.registerTool(
    'plan_printer_setup',
    {
      description:
        'Work out how to add a network printer by IP or hostname: which protocol it speaks and which driver to use (driverless IPP only when the printer supports it, otherwise a matching installed vendor driver). Returns the exact lpadmin command. Does not change anything.',
      inputSchema: {
        host: z.string().describe('IP address or hostname, e.g. 192.168.1.20'),
        model: z.string().optional().describe('Printer make and model, e.g. "Canon G3000". Needed for printers without IPP'),
        name: z.string().optional().describe('Queue name to use')
      },
      annotations: READ
    },
    async (args) => {
      const plan = await planSetup(args)
      return result(plan, !plan.ok)
    }
  )

  server.registerTool(
    'set_up_printer',
    {
      description: 'Add a network printer using the plan from plan_printer_setup. Only call after the person has agreed. If it needs admin rights, the result includes the sudo command for the person to run.',
      inputSchema: { host: z.string(), model: z.string().optional(), name: z.string().optional() },
      annotations: CHANGE
    },
    async (args) => {
      const res = await runSetup(await planSetup(args))
      return result(res, !res.ok)
    }
  )

  server.registerTool(
    'fix_printer',
    {
      description:
        'Apply the safe software fixes for a printer: resume it if stopped, turn job acceptance back on, and optionally clear stuck jobs. Reports physical problems (paper, ink, jams, offline) that a person must fix.',
      inputSchema: { printer: z.string(), clear_queue: z.boolean().optional().describe('Also cancel every queued job') },
      annotations: CHANGE
    },
    async ({ printer, clear_queue }) => {
      const res = await fixPrinter(printer, { clearQueue: clear_queue })
      return result(res, !res.ok)
    }
  )

  server.registerTool(
    'print_test_page',
    { description: 'Print a one-page test sheet to confirm a printer works.', inputSchema: { printer: z.string() }, annotations: CHANGE },
    async ({ printer }) => {
      const res = await printTestPage(printer)
      return result({ ok: res.ok, error: res.ok ? undefined : res.stderr.trim() }, !res.ok)
    }
  )

  await server.connect(new StdioServerTransport())
}
