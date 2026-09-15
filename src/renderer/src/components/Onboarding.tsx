import { useState } from 'react'
import { Check, ArrowRight, Terminal, ExternalLink, Loader2 } from 'lucide-react'
import type { Provider, ProviderRunResult } from '@shared/types'
import { Button, cx, StatusDot } from './ui'

export function Onboarding({
  providers,
  onComplete
}: {
  providers: Provider[]
  onComplete: (providerId: string) => void
}) {
  const available = providers.filter((p) => p.available)
  const [selected, setSelected] = useState<string | undefined>(available[0]?.id ?? providers[0]?.id)
  const [testing, setTesting] = useState<string | null>(null)
  const [tested, setTested] = useState<Record<string, ProviderRunResult>>({})

  const runTest = async (p: Provider) => {
    setTesting(p.id)
    try {
      const res = await window.api.providers.test(p)
      setTested((prev) => ({ ...prev, [p.id]: res }))
    } finally {
      setTesting(null)
    }
  }

  const chosen = providers.find((p) => p.id === selected)

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="drag h-11 w-full shrink-0" />
      <div className="mx-auto flex w-full max-w-[620px] flex-col px-8 pb-16 pt-6">
        <div className="mb-1 text-[12px] font-medium uppercase tracking-widest text-accent">Cursor for Printers</div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight">
          Cursor, for your printer.
        </h1>
        <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-muted">
          Drive your printer with plain English. Bring your own AI coding subscription as the engine —
          nothing is bundled, no keys are stored by us. Pick the engine you already pay for.
        </p>

        <div className="mt-8 flex flex-col gap-2.5">
          {providers.map((p) => {
            const isSel = selected === p.id
            const t = tested[p.id]
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={cx(
                  'group flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all',
                  isSel ? 'border-accent bg-accent/[0.06] ring-1 ring-accent/30' : 'border-border bg-panel hover:border-faint/60'
                )}
              >
                <div
                  className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    isSel ? 'bg-accent text-white' : 'bg-faint/12 text-muted'
                  )}
                >
                  <Terminal size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-ink">{p.name}</span>
                    {p.available ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-ok">
                        <StatusDot tone="ok" /> detected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                        <StatusDot tone="muted" /> not found
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-muted">{p.blurb}</div>
                  {t && (
                    <div className={cx('mt-1 text-[11px]', t.ok ? 'text-ok' : 'text-danger')}>
                      {t.ok ? `✓ responded in ${(t.durationMs / 1000).toFixed(1)}s` : `✕ ${t.error ?? 'test failed'}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {p.available && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        runTest(p)
                      }}
                      className="no-drag rounded-md px-2 py-1 text-[11px] text-muted hover:bg-faint/15 hover:text-ink"
                    >
                      {testing === p.id ? <Loader2 size={13} className="animate-spin" /> : 'Test'}
                    </span>
                  )}
                  {!p.available && p.homepage && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        window.api.system.openExternal(p.homepage!)
                      }}
                      className="no-drag inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:bg-faint/15 hover:text-ink"
                    >
                      Get <ExternalLink size={11} />
                    </span>
                  )}
                  <span
                    className={cx(
                      'flex h-5 w-5 items-center justify-center rounded-full border transition',
                      isSel ? 'border-accent bg-accent text-white' : 'border-faint/50 text-transparent'
                    )}
                  >
                    <Check size={12} />
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="max-w-[360px] text-[11.5px] leading-relaxed text-faint">
            You can add a custom CLI or switch engines anytime in Settings. On macOS, printing runs
            through CUPS (<span className="font-mono">lp</span>, <span className="font-mono">lpstat</span>).
          </p>
          <Button
            variant="primary"
            size="md"
            disabled={!chosen}
            onClick={() => chosen && onComplete(chosen.id)}
          >
            Continue with {chosen?.name ?? 'engine'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  )
}
