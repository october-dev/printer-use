// Shared type contracts used by main, preload and renderer.

export type PrinterState = 'idle' | 'processing' | 'stopped' | 'unknown'

export interface Printer {
  /** CUPS queue name, e.g. "Canon_PIXMA_G3000". */
  name: string
  /** Human label when we can derive one. */
  description?: string
  state: PrinterState
  /** Free-text reason CUPS reports (e.g. "Ready", "Paused"). */
  stateReason?: string
  /** Device URI, e.g. "lpd://192.168.1.16" or "ipp://...". */
  deviceUri?: string
  location?: string
  isDefault: boolean
  /** True when accepting jobs. */
  accepting: boolean
}

export interface DiscoveredDevice {
  /** Bonjour/mDNS service name. */
  name: string
  /** Service type, e.g. "_ipp._tcp". */
  serviceType: string
  host?: string
  ip?: string
  port?: number
  /** Suggested CUPS device URI we can pre-fill into "Add printer". */
  suggestedUri?: string
  /** True once a CUPS queue with the same target already exists. */
  alreadyAdded?: boolean
}

export interface PrintJob {
  id: string // "Canon_PIXMA_G3000-42"
  printer: string
  jobNumber: number
  title: string
  user?: string
  sizeBytes?: number
  submittedAt?: string
  state: 'pending' | 'held' | 'processing' | 'stopped' | 'completed' | 'canceled' | 'aborted' | 'unknown'
  rank?: string
}

export type Sides = 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge'
export type ColorMode = 'color' | 'monochrome'
export type Quality = 'draft' | 'normal' | 'high'
export type Orientation = 'portrait' | 'landscape'

/**
 * Structured, whitelisted print options. This is the ONLY thing the AI layer is
 * allowed to produce — the app deterministically turns it into an `lp` command,
 * so raw model text is never executed.
 */
export interface PrintOptions {
  printer?: string
  copies?: number
  sides?: Sides
  color?: ColorMode
  quality?: Quality
  orientation?: Orientation
  /** Media/paper size, e.g. "A4", "Letter", "Legal". */
  media?: string
  /** Page ranges string, e.g. "1-4,7". */
  pageRanges?: string
  /** Pages per sheet: 1,2,4,6,9,16. */
  numberUp?: number
  collate?: boolean
  fitToPage?: boolean
}

export interface ResolvedCommand {
  /** The binary, e.g. "lp". */
  bin: string
  /** argv array (never a shell string — no injection surface). */
  args: string[]
  /** Human-readable, shell-quoted preview shown in the UI before running. */
  preview: string
  /** Options actually applied, echoed back for the confirmation card. */
  applied: PrintOptions
  /** Target file(s). */
  files: string[]
  warnings: string[]
}

export interface NlInterpretation {
  options: PrintOptions
  /** One-line plain-English summary of what will happen. */
  summary: string
  /** The model's own notes / caveats, if any. */
  notes?: string
}

export type ProviderKind = 'cli'

export interface Provider {
  id: string
  name: string
  kind: ProviderKind
  /** Binary to invoke (looked up on PATH). */
  bin: string
  /**
   * argv template. The literal token "{PROMPT}" is replaced with the full prompt.
   * Kept as an array so there is no shell parsing.
   */
  args: string[]
  /** Short description shown in onboarding. */
  blurb: string
  /** Docs / where to get a subscription. */
  homepage?: string
  /** Filled at runtime: is the bin on PATH? */
  available?: boolean
  /** Resolved absolute path when available. */
  resolvedPath?: string
  /** True for user-defined custom providers. */
  custom?: boolean
}

export interface AppConfig {
  onboarded: boolean
  selectedProviderId?: string
  /** User-defined providers (custom CLIs). */
  customProviders: Provider[]
  theme: 'light' | 'dark' | 'system'
  /** Extra safety confirmation before submitting a physical job. */
  confirmBeforePrint: boolean
}

export interface ProviderRunResult {
  ok: boolean
  raw: string
  stderr?: string
  durationMs: number
  error?: string
}

export interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
  /** Exact argv we ran, for the activity log. */
  argv: string[]
}

/** Union returned by the NL translate step. */
export interface TranslateResult {
  ok: boolean
  interpretation?: NlInterpretation
  resolved?: ResolvedCommand
  error?: string
  /** Raw model output, surfaced for transparency / debugging. */
  raw?: string
}

export interface TranslateContext {
  userText: string
  files: string[]
  printers: Printer[]
  defaultPrinter?: string
  /** Printer the user picked in the UI (overrides the model's choice unless empty). */
  targetPrinter?: string
}

// ---- Printer setup (add-queue) contracts ----

export type DriverChoice =
  | { type: 'everywhere' }
  | { type: 'ppd'; ppdPath: string }
  | { type: 'model'; model: string }
  | { type: 'raw' }

export interface AddPrinterOpts {
  name: string
  uri: string
  driver: DriverChoice
  location?: string
  description?: string
}

export interface PpdEntry {
  path: string
  label: string
}

export interface DriverStrategy {
  recommended: DriverChoice | null
  matchingPpds: PpdEntry[]
  reason: string
}

export interface ResolvedService {
  host?: string
  port?: number
  ip?: string
  advertisesIpp: boolean
  suggestedUri?: string
}
