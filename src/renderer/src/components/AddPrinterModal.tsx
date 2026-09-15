import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Radar, Wifi, Check, Copy, Terminal } from 'lucide-react'
import type { DiscoveredDevice } from '@shared/types'
import { Button, Field, Input, Select, Modal, Badge, cx, StatusDot } from './ui'
import { useToast } from './toast'

type DriverMode = 'auto' | 'everywhere' | 'ppd' | 'raw'
interface Recommendation {
  recommended: any
  matchingPpds: { path: string; label: string }[]
  reason: string
}

function previewCommand(name: string, uri: string, mode: DriverMode, ppdPath: string, rec: Recommendation | null): string {
  const safeName = name.trim().replace(/\s+/g, '_') || 'Printer'
  const parts = ['lpadmin', '-p', safeName, '-E', '-v', uri || 'lpd://host/']
  const eff = mode === 'auto' ? (rec?.recommended?.type ?? 'everywhere') : mode
  if (eff === 'everywhere') parts.push('-m', 'everywhere')
  else if (eff === 'ppd') parts.push('-P', mode === 'auto' ? rec?.recommended?.ppdPath ?? '<ppd>' : ppdPath || '<ppd>')
  else if (eff === 'raw') parts.push('-m', 'raw')
  return parts.map((t) => (/^[A-Za-z0-9_./:=,+-]+$/.test(t) ? t : `'${t}'`)).join(' ')
}

export function AddPrinterModal({
  open,
  onClose,
  onAdded
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [name, setName] = useState('')
  const [uri, setUri] = useState('')
  const [advertisesIpp, setAdvertisesIpp] = useState(false)
  const [mode, setMode] = useState<DriverMode>('auto')
  const [ppdQuery, setPpdQuery] = useState('')
  const [ppdResults, setPpdResults] = useState<{ path: string; label: string }[]>([])
  const [ppdPath, setPpdPath] = useState('')
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const reset = useCallback(() => {
    setDevices([])
    setName('')
    setUri('')
    setAdvertisesIpp(false)
    setMode('auto')
    setPpdQuery('')
    setPpdResults([])
    setPpdPath('')
    setRec(null)
    setHint(null)
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const scan = async () => {
    setScanning(true)
    setDevices([])
    try {
      setDevices(await window.api.printers.discover())
    } finally {
      setScanning(false)
    }
  }

  const recommend = useCallback(
    async (ippAdvertised: boolean, deviceUri: string, hintText: string) => {
      setBusy(true)
      try {
        const r = await window.api.printers.chooseDriver({
          advertisesIpp: ippAdvertised,
          uri: deviceUri,
          makeAndModelHint: hintText
        })
        setRec(r)
        if (r.matchingPpds.length) {
          setPpdResults(r.matchingPpds)
          if (!ppdPath) setPpdPath(r.matchingPpds[0].path)
        }
      } finally {
        setBusy(false)
      }
    },
    [ppdPath]
  )

  const selectDevice = async (d: DiscoveredDevice) => {
    setBusy(true)
    try {
      const resolved = await window.api.printers.resolveService(d.name, d.serviceType)
      const cleanName = d.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      setName(cleanName)
      setAdvertisesIpp(resolved.advertisesIpp)
      if (resolved.suggestedUri) setUri(resolved.suggestedUri)
      await recommend(resolved.advertisesIpp, resolved.suggestedUri ?? uri, d.name)
    } finally {
      setBusy(false)
    }
  }

  const searchPpds = async (q: string) => {
    setPpdQuery(q)
    if (q.trim().length < 2) return
    setPpdResults(await window.api.printers.findPpds(q))
  }

  const add = async () => {
    if (!name.trim() || !uri.trim()) {
      toast({ tone: 'error', title: 'Name and device URI are required' })
      return
    }
    let driver: any
    if (mode === 'auto') {
      if (!rec?.recommended) {
        toast({ tone: 'error', title: 'No driver chosen', detail: rec?.reason ?? 'Run “Recommend”, pick a driver, or install the vendor driver.' })
        return
      }
      driver = rec.recommended
    } else if (mode === 'everywhere') driver = { type: 'everywhere' }
    else if (mode === 'raw') driver = { type: 'raw' }
    else {
      if (!ppdPath) {
        toast({ tone: 'error', title: 'Pick a PPD driver first' })
        return
      }
      driver = { type: 'ppd', ppdPath }
    }

    setAdding(true)
    setHint(null)
    try {
      const res = await window.api.printers.add({ name: name.trim(), uri: uri.trim(), driver })
      if (res.ok) {
        toast({ tone: 'ok', title: `Added ${name.trim()}` })
        onAdded()
        onClose()
      } else {
        toast({ tone: 'error', title: 'Could not add printer', detail: (res.stderr || res.stdout).trim() })
        if ((res as any).hint) setHint((res as any).hint)
      }
    } finally {
      setAdding(false)
    }
  }

  const preview = useMemo(() => previewCommand(name, uri, mode, ppdPath, rec), [name, uri, mode, ppdPath, rec])

  return (
    <Modal open={open} onClose={onClose} title="Add a printer" width="max-w-xl">
      {/* Discover */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
            <Radar size={14} className="text-accent" /> Discover on network
          </span>
          <Button size="sm" onClick={scan} disabled={scanning}>
            {scanning ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
        </div>
        {devices.length === 0 ? (
          <p className="text-[11.5px] text-faint">
            {scanning ? 'Browsing Bonjour/mDNS…' : 'No devices yet. Driver-only printers (no AirPrint) may not appear — add them by IP below.'}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {devices.map((d) => {
              const ipp = d.serviceType === '_ipp._tcp' || d.serviceType === '_ipps._tcp'
              return (
                <button
                  key={`${d.name}-${d.serviceType}`}
                  onClick={() => selectDevice(d)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-faint/10"
                >
                  <StatusDot tone="ok" />
                  <span className="flex-1 truncate text-[12.5px]">{d.name}</span>
                  {ipp ? <Badge tone="accent">AirPrint</Badge> : <Badge>{d.serviceType.replace(/^_|\._tcp$/g, '')}</Badge>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Manual / resolved fields */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Queue name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Canon_PIXMA_G3000" />
        </Field>
        <Field label="Device URI" hint={advertisesIpp ? 'IPP detected' : 'LPD / socket'}>
          <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="lpd://192.168.1.16/" />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Driver" hint={busy ? 'analyzing…' : undefined}>
          <div className="flex gap-2">
            <Select value={mode} onChange={(e) => setMode(e.target.value as DriverMode)} className="flex-1">
              <option value="auto">Auto — recommend best driver</option>
              <option value="everywhere">IPP Everywhere (driverless)</option>
              <option value="ppd">Installed driver (PPD)…</option>
              <option value="raw">Raw (send file as-is)</option>
            </Select>
            <Button
              variant="default"
              onClick={() => recommend(advertisesIpp, uri, name.replace(/_/g, ' '))}
              disabled={!uri || busy}
            >
              Recommend
            </Button>
          </div>
        </Field>

        {rec && (
          <p className={cx('mt-1.5 text-[11.5px]', rec.recommended ? 'text-muted' : 'text-warn')}>{rec.reason}</p>
        )}

        {(mode === 'ppd' || (mode === 'auto' && rec?.recommended?.type === 'ppd')) && (
          <div className="mt-2">
            <Input
              value={ppdQuery}
              onChange={(e) => searchPpds(e.target.value)}
              placeholder="Search installed drivers (e.g. Canon G3000)…"
              className="mb-1.5"
            />
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border">
              {ppdResults.length === 0 ? (
                <div className="px-3 py-2 text-[11.5px] text-faint">
                  No matching drivers found. Install the vendor CUPS driver, then search again.
                </div>
              ) : (
                ppdResults.map((p) => (
                  <button
                    key={p.path}
                    onClick={() => {
                      setPpdPath(p.path)
                      if (mode === 'auto') setMode('ppd')
                    }}
                    className={cx(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition hover:bg-faint/10',
                      ppdPath === p.path && 'bg-accent/10'
                    )}
                  >
                    {ppdPath === p.path ? <Check size={12} className="text-accent" /> : <span className="w-3" />}
                    <span className="flex-1 truncate">{p.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Command preview */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
        <Terminal size={13} className="mt-0.5 shrink-0 text-accent" />
        <code className="flex-1 whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-ink">{preview}</code>
        <button
          onClick={() => navigator.clipboard.writeText(preview)}
          className="rounded p-0.5 text-faint hover:bg-faint/15 hover:text-ink"
        >
          <Copy size={12} />
        </button>
      </div>

      {hint && (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-warn/30 bg-warn/10 p-3 font-mono text-[11px] text-ink">
          {hint}
        </pre>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={add} disabled={adding}>
          {adding ? <Loader2 size={14} className="animate-spin" /> : null}
          Add printer
        </Button>
      </div>
    </Modal>
  )
}
