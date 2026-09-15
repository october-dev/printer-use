import { basename } from 'node:path'
import { runProvider } from './providers'
import { buildLpCommand } from './lp-builder'
import type { Provider, PrintOptions, NlInterpretation, TranslateResult, TranslateContext } from '../shared/types'

const SCHEMA_DOC = `Return ONLY a single JSON object (no markdown, no prose, no code fences) of this exact shape:
{
  "options": {
    "printer": string | null,            // CUPS queue name from the AVAILABLE PRINTERS list, or null
    "copies": integer | null,            // 1-999
    "sides": "one-sided" | "two-sided-long-edge" | "two-sided-short-edge" | null,
    "color": "color" | "monochrome" | null,   // grayscale/black&white => "monochrome"
    "quality": "draft" | "normal" | "high" | null,
    "orientation": "portrait" | "landscape" | null,
    "media": string | null,              // paper size like "A4","Letter","Legal","A5"
    "pageRanges": string | null,         // e.g. "1-4,7"
    "numberUp": 1 | 2 | 4 | 6 | 9 | 16 | null,  // pages per sheet
    "collate": boolean | null,
    "fitToPage": boolean | null
  },
  "summary": string,   // one plain-English sentence describing what will be printed
  "notes": string | null  // optional caveats or assumptions
}
Rules:
- Only set fields the user actually requested or clearly implied. Leave everything else null.
- "double-sided" => sides="two-sided-long-edge" unless they say short-edge/flip-up.
- "grayscale"/"black and white"/"b&w" => color="monochrome".
- Never invent a copy count; if unspecified leave copies null (defaults to 1).
- If the user names a printer, match it to the AVAILABLE PRINTERS list exactly.`

export function buildPrompt(ctx: TranslateContext): string {
  const fileList = ctx.files.length ? ctx.files.map((f) => basename(f)).join(', ') : '(no file selected yet)'
  const printerLines = ctx.printers.length
    ? ctx.printers.map((p) => `- ${p.name}${p.isDefault ? ' (default)' : ''} — ${p.state}${p.location ? `, ${p.location}` : ''}`).join('\n')
    : '- (none configured)'

  return `You translate a natural-language printing request into structured CUPS print options.

AVAILABLE PRINTERS:
${printerLines}

DEFAULT PRINTER: ${ctx.defaultPrinter ?? '(none)'}
FILE(S) TO PRINT: ${fileList}
${ctx.targetPrinter ? `USER-SELECTED PRINTER (prefer this): ${ctx.targetPrinter}` : ''}

USER REQUEST: "${ctx.userText}"

${SCHEMA_DOC}`
}

/** Find balanced {...} substrings (ignoring braces inside strings). */
function findJsonCandidates(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }
  return out
}

/**
 * Pull the interpretation JSON out of raw provider output. Handles Claude Code's
 * `--output-format json` envelope ({ result: "..." }) and noisy CLI logs by
 * scanning for the first balanced object that looks like our schema.
 */
export function extractInterpretation(raw: string): NlInterpretation | null {
  let text = raw

  // Unwrap common CLI envelopes first.
  try {
    const outer = JSON.parse(raw.trim())
    if (outer && typeof outer === 'object') {
      if (typeof outer.result === 'string') text = outer.result
      else if (outer.options || outer.summary) return coerce(outer)
      else if (typeof outer.text === 'string') text = outer.text
      else if (typeof outer.content === 'string') text = outer.content
    }
  } catch {
    /* not a bare JSON envelope; scan the text */
  }

  const candidates = findJsonCandidates(text)
  // Prefer candidates that mention our keys.
  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c)
      if (parsed && typeof parsed === 'object' && (parsed.options || parsed.summary)) return coerce(parsed)
    } catch {
      /* try next */
    }
  }
  return null
}

function scoreCandidate(c: string): number {
  let s = 0
  if (c.includes('"options"')) s += 2
  if (c.includes('"summary"')) s += 1
  return s
}

function coerce(obj: any): NlInterpretation {
  const rawOpts = (obj.options ?? {}) as Record<string, unknown>
  const options: PrintOptions = {}
  const num = (v: unknown) => (v == null ? undefined : Number(v))
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)

  options.printer = str(rawOpts.printer)
  if (rawOpts.copies != null) options.copies = num(rawOpts.copies)
  options.sides = str(rawOpts.sides) as PrintOptions['sides']
  options.color = str(rawOpts.color) as PrintOptions['color']
  options.quality = str(rawOpts.quality) as PrintOptions['quality']
  options.orientation = str(rawOpts.orientation) as PrintOptions['orientation']
  options.media = str(rawOpts.media)
  options.pageRanges = str(rawOpts.pageRanges)
  if (rawOpts.numberUp != null) options.numberUp = num(rawOpts.numberUp)
  options.collate = bool(rawOpts.collate)
  options.fitToPage = bool(rawOpts.fitToPage)

  return {
    options,
    summary: str(obj.summary) ?? 'Print with the interpreted options.',
    notes: str(obj.notes)
  }
}

/** Full pipeline: prompt → provider → interpretation → deterministic lp command. */
export async function translate(provider: Provider, ctx: TranslateContext): Promise<TranslateResult> {
  const prompt = buildPrompt(ctx)
  const res = await runProvider(provider, prompt)
  if (!res.ok) return { ok: false, error: res.error ?? 'Provider failed.', raw: res.raw }

  const interpretation = extractInterpretation(res.raw)
  if (!interpretation) {
    return {
      ok: false,
      error: 'Could not read a valid response from the AI provider. Try rephrasing, or check the provider in Settings.',
      raw: res.raw
    }
  }

  // The UI-selected printer wins if present; else the model's pick; else default.
  const printer = ctx.targetPrinter || interpretation.options.printer || ctx.defaultPrinter
  const options: PrintOptions = { ...interpretation.options, printer }

  const resolved = buildLpCommand(options, ctx.files)
  return { ok: true, interpretation: { ...interpretation, options }, resolved, raw: res.raw }
}
