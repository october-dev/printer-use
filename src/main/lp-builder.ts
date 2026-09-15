import type { PrintOptions, ResolvedCommand, Sides, ColorMode, Quality, Orientation } from '../shared/types'

const SIDES: Sides[] = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge']
const COLORS: ColorMode[] = ['color', 'monochrome']
const QUALITY: Quality[] = ['draft', 'normal', 'high']
const ORIENTATION: Orientation[] = ['portrait', 'landscape']
const NUMBER_UP = [1, 2, 4, 6, 9, 16]

const PAGE_RANGE_RE = /^\d+(-\d+)?(,\s*\d+(-\d+)?)*$/
const MEDIA_RE = /^[A-Za-z0-9_.-]{1,32}$/

const QUALITY_ENUM: Record<Quality, string> = { draft: '3', normal: '4', high: '5' }

/** Quote a single argv token for a copy-pasteable preview string (display only). */
function shellQuote(token: string): string {
  if (token === '') return "''"
  if (/^[A-Za-z0-9_./:=,+-]+$/.test(token)) return token
  return `'${token.replace(/'/g, `'\\''`)}'`
}

/**
 * Deterministically turn whitelisted PrintOptions + files into an `lp` invocation.
 *
 * Everything is validated against enums/regexes here; anything unrecognized is
 * dropped with a warning rather than passed through. The AI never gets to inject
 * flags — it can only nudge these known fields.
 */
export function buildLpCommand(options: PrintOptions, files: string[]): ResolvedCommand {
  const args: string[] = []
  const applied: PrintOptions = {}
  const warnings: string[] = []

  if (options.printer && /^[A-Za-z0-9_.@-]+$/.test(options.printer)) {
    args.push('-d', options.printer)
    applied.printer = options.printer
  } else if (options.printer) {
    warnings.push(`Ignored invalid printer name "${options.printer}".`)
  }

  if (options.copies != null) {
    const n = Math.trunc(Number(options.copies))
    if (Number.isFinite(n) && n >= 1 && n <= 999) {
      args.push('-n', String(n))
      applied.copies = n
    } else {
      warnings.push(`Copies must be 1–999; ignored "${options.copies}".`)
    }
  }

  if (options.sides) {
    if (SIDES.includes(options.sides)) {
      args.push('-o', `sides=${options.sides}`)
      applied.sides = options.sides
    } else {
      warnings.push(`Unknown sides value "${options.sides}".`)
    }
  }

  if (options.color) {
    if (COLORS.includes(options.color)) {
      args.push('-o', `print-color-mode=${options.color}`)
      applied.color = options.color
    } else {
      warnings.push(`Unknown color mode "${options.color}".`)
    }
  }

  if (options.quality) {
    if (QUALITY.includes(options.quality)) {
      args.push('-o', `print-quality=${QUALITY_ENUM[options.quality]}`)
      applied.quality = options.quality
    } else {
      warnings.push(`Unknown quality "${options.quality}".`)
    }
  }

  if (options.orientation) {
    if (ORIENTATION.includes(options.orientation)) {
      // 3 = portrait (default, no need to set), 4 = landscape.
      if (options.orientation === 'landscape') args.push('-o', 'orientation-requested=4')
      applied.orientation = options.orientation
    } else {
      warnings.push(`Unknown orientation "${options.orientation}".`)
    }
  }

  if (options.media) {
    if (MEDIA_RE.test(options.media)) {
      args.push('-o', `media=${options.media}`)
      applied.media = options.media
    } else {
      warnings.push(`Ignored invalid media value "${options.media}".`)
    }
  }

  if (options.pageRanges) {
    const cleaned = options.pageRanges.replace(/\s+/g, '')
    if (PAGE_RANGE_RE.test(cleaned)) {
      args.push('-o', `page-ranges=${cleaned}`)
      applied.pageRanges = cleaned
    } else {
      warnings.push(`Ignored malformed page range "${options.pageRanges}".`)
    }
  }

  if (options.numberUp != null) {
    const n = Math.trunc(Number(options.numberUp))
    if (NUMBER_UP.includes(n)) {
      args.push('-o', `number-up=${n}`)
      applied.numberUp = n
    } else {
      warnings.push(`Pages-per-sheet must be one of ${NUMBER_UP.join(', ')}.`)
    }
  }

  if (options.collate != null) {
    args.push('-o', `collate=${options.collate ? 'true' : 'false'}`)
    applied.collate = !!options.collate
  }

  if (options.fitToPage) {
    args.push('-o', 'fit-to-page')
    applied.fitToPage = true
  }

  // Files last. Existence is validated by the caller in main.
  const validFiles = files.filter((f) => typeof f === 'string' && f.trim().length > 0)
  args.push(...validFiles)

  if (validFiles.length === 0) {
    warnings.push('No file selected — pick a file to print before running.')
  }

  const bin = 'lp'
  const preview = [bin, ...args].map(shellQuote).join(' ')

  return { bin, args, preview, applied, files: validFiles, warnings }
}
