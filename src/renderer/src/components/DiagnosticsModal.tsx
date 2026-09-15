import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  Wifi,
  WifiOff,
  Power,
  PlayCircle,
  Trash2,
  FileText,
  Sparkles,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  RefreshCw
} from 'lucide-react'
import type { PrinterDiagnostics, ReasonInfo } from '@shared/types'
import { useStudio } from '../studio'
import { Modal, Button, cx } from './ui'
import { useToast } from './toast'

const DEMO = new URLSearchParams(window.location.search).get('demo') === '1'

const DEMO_DIAG: PrinterDiagnostics = {
  name: 'Canon_PIXMA_G3000',
  state: 'stopped',
  accepting: false,
  deviceUri: 'lpd://192.168.1.16/',
  host: '192.168.1.16',
  reachable: true,
  ports: [
    { port: 515, label: 'LPD', open: true },
    { port: 631, label: 'IPP', open: false },
    { port: 9100, label: 'Raw / JetDirect', open: false },
    { port: 80, label: 'HTTP', open: true },
    { port: 443, label: 'HTTPS', open: false }
  ],
  reasons: [
    { code: 'media-jam-error', label: 'Paper jam', severity: 'error' },
    { code: 'paused', label: 'Queue paused', severity: 'warn' }
  ],
  jobs: 2,
  summary: 'demo'
}

const DEMO_EXPLANATION =
  'The printer is reachable over LPD (port 515) but the queue is paused after a paper jam — likely the 5100 carriage error on the G3000. Steps:\n1. Open the cover, remove any jammed paper or obstruction, and free the carriage.\n2. Power-cycle the printer to clear the error.\n3. Resume the queue: cupsenable Canon_PIXMA_G3000\n4. Let it accept jobs again: cupsaccept Canon_PIXMA_G3000\n5. Clear the 2 stuck jobs: cancel -a Canon_PIXMA_G3000, then print a test page.'

export function DiagnosticsModal({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
  const toast = useToast()
  const { refreshPrinters, refreshJobs } = useStudio()
  const [diag, setDiag] = useState<PrinterDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explanation, setExplanation] = useState<string | null>(null)

  const runDiag = useCallback(async () => {
    if (!name) return
    if (DEMO) {
      setDiag(DEMO_DIAG)
      setExplanation(DEMO_EXPLANATION)
      return
    }
    setLoading(true)
    try {
      setDiag(await window.api.printers.diagnose(name))
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => {
    if (open && name) {
      setExplanation(null)
      runDiag()
    }
  }, [open, name, runDiag])

  const act = async (key: string, fn: () => Promise<{ ok: boolean; stderr?: string; hint?: string }>, ok: string) => {
    setBusy(key)
    try {
      const res = await fn()
      if (res.ok) {
        toast({ tone: 'ok', title: ok })
        await Promise.all([runDiag(), refreshPrinters(), refreshJobs()])
      } else {
        toast({ tone: 'error', title: 'Command failed', detail: (res as any).hint || res.stderr })
      }
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Remove the printer "${name}" from this Mac?`)) return
    await act('remove', () => window.api.printers.remove(name), `Removed ${name}`)
    onClose()
  }

  const explain = async () => {
    if (!diag) return
    setExplaining(true)
    setExplanation(null)
    try {
      const res = await window.api.printers.explain(diag)
      if (res.ok) setExplanation(res.text ?? '')
      else toast({ tone: 'error', title: 'Could not diagnose', detail: res.error })
    } finally {
      setExplaining(false)
    }
  }

  const healthy = diag && diag.reasons.length === 0 && diag.accepting && diag.state !== 'stopped' && diag.reachable !== false

  return (
    <Modal open={open} onClose={onClose} title={`Diagnostics — ${name}`} width="max-w-xl">
      {loading && !diag ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> Running checks…
        </div>
      ) : diag ? (
        <div className="space-y-4">
          {/* Overall */}
          <div
            className={cx(
              'flex items-center gap-3 rounded-xl p-3',
              healthy ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
            )}
          >
            {healthy ? <CheckCircle2 size={18} /> : <Activity size={18} />}
            <div className="flex-1">
              <div className="text-[13px] font-medium text-ink">
                {healthy ? 'Everything looks healthy' : 'Needs attention'}
              </div>
              <div className="text-[11.5px] text-muted capitalize">
                {diag.state}
                {!diag.accepting && ' · not accepting jobs'}
                {diag.jobs > 0 && ` · ${diag.jobs} job(s) queued`}
              </div>
            </div>
            <button onClick={runDiag} className="rounded-md p-1.5 text-muted hover:bg-faint/15 hover:text-ink" title="Re-run">
              <RefreshCw size={14} className={cx(loading && 'animate-spin')} />
            </button>
          </div>

          {/* Reachability */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {diag.reachable ? <Wifi size={12} /> : <WifiOff size={12} />} Connection
            </div>
            {diag.host ? (
              <div className="rounded-xl border border-border/60 bg-surface/60 p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px]">
                  <span className={cx('h-2 w-2 rounded-full', diag.reachable ? 'bg-ok' : 'bg-danger')} />
                  <span className="font-mono text-ink">{diag.host}</span>
                  <span className="text-muted">{diag.reachable ? 'reachable' : 'not reachable'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {diag.ports.map((p) => (
                    <span
                      key={p.port}
                      className={cx(
                        'rounded-md px-1.5 py-0.5 text-[10.5px] font-medium',
                        p.open ? 'bg-ok/12 text-ok' : 'bg-faint/12 text-faint'
                      )}
                      title={`${p.label} · port ${p.port}`}
                    >
                      {p.port} {p.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-muted">No network device URI to probe (local or USB printer).</p>
            )}
          </div>

          {/* Reasons */}
          {diag.reasons.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Reported issues</div>
              <div className="space-y-1">
                {diag.reasons.map((r) => (
                  <ReasonRow key={r.code} r={r} />
                ))}
              </div>
            </div>
          )}

          {/* AI explanation */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">AI troubleshooting</span>
              <Button size="sm" variant="subtle" onClick={explain} disabled={explaining}>
                {explaining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {explanation ? 'Re-run' : 'Explain & fix'}
              </Button>
            </div>
            {explanation ? (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="whitespace-pre-wrap rounded-xl border border-accent/20 bg-accent/[0.05] p-3 text-[12.5px] leading-relaxed text-ink"
              >
                {explanation}
              </motion.div>
            ) : (
              <p className="text-[11.5px] text-faint">Ask your AI engine to interpret these results and suggest fixes.</p>
            )}
          </div>

          {/* Quick fixes */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Quick fixes</div>
            <div className="flex flex-wrap gap-2">
              {diag.state === 'stopped' && (
                <FixButton icon={Power} label="Resume printer" busy={busy === 'enable'} onClick={() => act('enable', () => window.api.printers.enable(name), 'Printer resumed')} />
              )}
              {!diag.accepting && (
                <FixButton icon={PlayCircle} label="Accept jobs" busy={busy === 'accept'} onClick={() => act('accept', () => window.api.printers.accept(name), 'Now accepting jobs')} />
              )}
              {diag.jobs > 0 && (
                <FixButton icon={Trash2} label={`Clear queue (${diag.jobs})`} busy={busy === 'clear'} onClick={() => act('clear', () => window.api.jobs.cancelAll(name), 'Queue cleared')} />
              )}
              <FixButton icon={FileText} label="Print test page" busy={busy === 'test'} onClick={() => act('test', () => window.api.printers.testPage(name), 'Test page sent')} />
              <FixButton icon={Trash2} label="Remove printer" danger busy={busy === 'remove'} onClick={remove} />
            </div>
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-muted">No diagnostics.</p>
      )}
    </Modal>
  )
}

function ReasonRow({ r }: { r: ReasonInfo }) {
  const Icon = r.severity === 'error' ? AlertCircle : r.severity === 'warn' ? AlertTriangle : Info
  const color = r.severity === 'error' ? 'text-danger' : r.severity === 'warn' ? 'text-warn' : 'text-muted'
  return (
    <div className="flex items-center gap-2 rounded-lg bg-faint/[0.06] px-2.5 py-1.5 text-[12.5px]">
      <Icon size={14} className={color} />
      <span className="text-ink">{r.label}</span>
    </div>
  )
}

function FixButton({
  icon: Icon,
  label,
  onClick,
  busy,
  danger
}: {
  icon: typeof Power
  label: string
  onClick: () => void
  busy?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cx(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-50',
        danger
          ? 'border-danger/20 bg-danger/5 text-danger hover:bg-danger/10'
          : 'border-border/60 bg-surface/60 text-ink hover:border-faint/50 hover:bg-faint/10'
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
      {label}
    </button>
  )
}
