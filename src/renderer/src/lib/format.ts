import type { PrintOptions } from '@shared/types'

export function basename(p: string): string {
  return p.split('/').pop() || p
}

export function fileExt(p: string): string {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i + 1).toUpperCase() : ''
}

export function bytes(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

const OPTION_LABELS: Record<string, (v: any) => string> = {
  copies: (v) => `${v} ${v === 1 ? 'copy' : 'copies'}`,
  sides: (v) =>
    v === 'one-sided'
      ? 'single-sided'
      : v === 'two-sided-long-edge'
        ? 'double-sided'
        : 'double-sided (short edge)',
  color: (v) => (v === 'monochrome' ? 'grayscale' : 'color'),
  quality: (v) => `${v} quality`,
  orientation: (v) => v,
  media: (v) => v,
  pageRanges: (v) => `pages ${v}`,
  numberUp: (v) => `${v}-up`,
  collate: (v) => (v ? 'collated' : 'uncollated'),
  fitToPage: () => 'fit to page'
}

export function describeOptions(applied: PrintOptions): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(applied)) {
    if (v == null || k === 'printer') continue
    const fn = OPTION_LABELS[k]
    if (fn) out.push(fn(v))
  }
  return out
}
