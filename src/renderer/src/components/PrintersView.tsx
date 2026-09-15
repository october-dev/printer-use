import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Printer as PrinterIcon, Star, CheckCircle2, MapPin, Loader2 } from 'lucide-react'
import type { Printer } from '@shared/types'
import { Button, Badge, StatusDot, cx } from './ui'
import { useToast } from './toast'
import { AddPrinterModal } from './AddPrinterModal'

function stateTone(p: Printer): 'ok' | 'warn' | 'danger' | 'muted' {
  if (!p.accepting) return 'warn'
  if (p.state === 'idle' || p.state === 'processing') return 'ok'
  if (p.state === 'stopped') return 'danger'
  return 'muted'
}

export function PrintersView() {
  const toast = useToast()
  const [printers, setPrinters] = useState<Printer[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [settingDefault, setSettingDefault] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setPrinters(await window.api.printers.list())
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [load])

  const setDefault = async (name: string) => {
    setSettingDefault(name)
    try {
      const res = await window.api.printers.setDefault(name)
      if (res.ok) {
        toast({ tone: 'ok', title: `${name} is now the default` })
        load()
      } else {
        toast({ tone: 'error', title: 'Could not set default', detail: res.stderr.trim() })
      }
    } finally {
      setSettingDefault(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-16 pt-2">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Printers</h1>
          <p className="mt-1 text-[13px] text-muted">Discover, configure, and set your default printer.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw size={14} className={cx(refreshing && 'animate-spin')} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add printer
          </Button>
        </div>
      </header>

      {printers === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-[76px] rounded-xl" />
          ))}
        </div>
      ) : printers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-faint/10 text-muted">
            <PrinterIcon size={20} />
          </div>
          <div className="text-[14px] font-medium">No printers configured</div>
          <p className="mt-1 max-w-[320px] text-[12.5px] text-muted">
            Add your printer to start. AirPrint printers are auto-discovered; driver-only printers can be
            added by IP.
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add printer
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {printers.map((p) => (
            <div key={p.name} className="rounded-xl border border-border bg-panel p-4 transition hover:border-faint/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-faint/10 text-muted">
                    <PrinterIcon size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-ink">{p.name}</span>
                      {p.isDefault && (
                        <Badge tone="accent">
                          <Star size={10} /> default
                        </Badge>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                        <StatusDot tone={stateTone(p)} />
                        {p.accepting ? p.state : 'not accepting'}
                        {p.stateReason && p.stateReason !== p.state ? ` · ${p.stateReason}` : ''}
                      </span>
                    </div>
                    {p.description && p.description !== p.name && (
                      <div className="mt-0.5 text-[12px] text-muted">{p.description}</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-faint">
                      {p.deviceUri && <span className="font-mono">{p.deviceUri}</span>}
                      {p.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={10} /> {p.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {p.isDefault ? (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-ok">
                      <CheckCircle2 size={13} /> default
                    </span>
                  ) : (
                    <Button size="sm" variant="subtle" onClick={() => setDefault(p.name)} disabled={settingDefault === p.name}>
                      {settingDefault === p.name ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
                      Set default
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddPrinterModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </div>
  )
}
