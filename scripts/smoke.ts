// End-to-end smoke test of the real NL pipeline against actual provider output.
// Bundled with esbuild, then run with node. Not part of the app build.
import { readFileSync } from 'node:fs'
import { extractInterpretation } from '../src/main/nl'
import { buildLpCommand } from '../src/main/lp-builder'

const rawPath = process.argv[2]
const raw = readFileSync(rawPath, 'utf8')

const interp = extractInterpretation(raw)
if (!interp) {
  console.error('FAIL: could not extract interpretation from provider output')
  process.exit(1)
}

const resolved = buildLpCommand({ ...interp.options }, ['/Users/harsh/Documents/quarterly-report.pdf'])

console.log('SUMMARY :', interp.summary)
console.log('APPLIED :', JSON.stringify(resolved.applied))
console.log('COMMAND :', resolved.preview)
console.log('WARNINGS:', resolved.warnings.length ? resolved.warnings : '(none)')

// Assertions for the sample request: "double-sided, 2 copies, grayscale, pages 1-3".
const a = resolved.applied
const ok =
  a.copies === 2 &&
  a.sides === 'two-sided-long-edge' &&
  a.color === 'monochrome' &&
  a.pageRanges === '1-3' &&
  a.printer === 'Canon_PIXMA_G3000' &&
  resolved.preview.includes('-o sides=two-sided-long-edge') &&
  resolved.preview.includes('-o print-color-mode=monochrome') &&
  resolved.preview.includes('-o page-ranges=1-3') &&
  resolved.preview.includes('-n 2')

console.log(ok ? '\nPASS ✓ pipeline produced the correct lp command' : '\nFAIL ✗ command did not match expectations')
process.exit(ok ? 0 : 1)
