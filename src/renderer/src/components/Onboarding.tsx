import { useState } from 'react'
import { Check, ArrowRight, Terminal, ExternalLink, Loader2, Printer as PrinterIcon } from 'lucide-react'
import type { Provider, ProviderRunResult } from '@shared/types'
import { Button, cx } from './ui'

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
      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[440px] animate-fade-in">
          {/* App mark + hero */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-accent text-white shadow-lg shadow-accent/30">
              <PrinterIcon size={22} />
            </div>
            <h1 className="text-[24px] font-semibold tracking-tight">Cursor, for your printer.</h1>
            <p className="mt-2 max-w-[360px] text-[13px] leading-relaxed text-muted">
              Drive your printer with plain English. Bring your own AI engine — nothing bundled, no keys stored.
            </p>
          </div>

          <div className="mb-2.5 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
            Choose your engine
          </div>

          <div className="flex flex-col gap-1">
            {providers.map((p) => {
              const isSel = selected === p.id
              const t = tested[p.id]
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                    isSel ? 'bg-accent/[0.08] ring-1 ring-accent/35' : 'hover:bg-faint/[0.07]'
                  )}
                >
                  <div
                    className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
                      isSel ? 'bg-accent text-white' : 'bg-faint/10 text-muted'
                    )}
                  >
                    <Terminal size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium text-ink">{p.name}</span>
                      {p.available ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-ok" title="detected" />
                      ) : (
                        <span className="text-[10.5px] text-faint">not found</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-muted">
                      {t ? (
                        <span className={t.ok ? 'text-ok' : 'text-danger'}>
                          {t.ok ? `Responded in ${(t.durationMs / 1000).toFixed(1)}s` : t.error ?? 'Test failed'}
                        </span>
                      ) : (
                        p.blurb
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {p.available ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          runTest(p)
                        }}
                        className="no-drag rounded-md px-2 py-1 text-[11px] text-faint opacity-0 transition hover:bg-faint/15 hover:text-ink group-hover:opacity-100"
                      >
                        {testing === p.id ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                      </span>
                    ) : (
                      p.homepage && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            window.api.system.openExternal(p.homepage!)
                          }}
                          className="no-drag inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-faint hover:bg-faint/15 hover:text-ink"
                        >
                          Get <ExternalLink size={10} />
                        </span>
                      )
                    )}
                    <span
                      className={cx(
                        'flex items-center justify-center rounded-full transition',
                        isSel ? 'bg-accent text-white' : 'text-transparent'
                      )}
                      style={{ height: 18, width: 18 }}
                    >
                      <Check size={11} />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <Button
            variant="primary"
            className="mt-5 w-full"
            disabled={!chosen}
            onClick={() => chosen && onComplete(chosen.id)}
          >
            Continue with {chosen?.name ?? 'engine'}
            <ArrowRight size={15} />
          </Button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
            Switch engines or add a custom CLI anytime in Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
