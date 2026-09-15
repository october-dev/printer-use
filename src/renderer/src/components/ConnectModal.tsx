import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Radar,
  Wifi,
  Loader2,
  Check,
  Printer as PrinterIcon,
  Zap,
  Plug,
  ChevronDown,
  Copy,
  Terminal
} from 'lucide-react'
import type { DiscoveredDevice, ResolvedService, DriverChoice } from '@shared/types'
import { useStudio } from '../studio'
import { Modal, Button, Field, Input, Select, cx } from './ui'
import { useToast } from './toast'

interface DeviceRow {
  device: DiscoveredDevice
  resolved?: ResolvedService
  openPorts: number[]
  reachable?: boolean
  alreadyAdded?: boolean
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Printer'

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { printers, refreshPrinters } = useStudio()
  const [scanning, setScanning] = useState(false)
  const [rows, setRows] = useState<DeviceRow[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)

  // Manual / advanced
  const [advanced, setAdvanced] = useState(false)
  const [ip, setIp] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [name, setName] = useState('')
  const [uri, setUri] = useState('')
  const [driverMode, setDriverMode] = useState<'auto' | 'everywhere' | 'ppd'>('auto')
  const [ppdQuery, setPpdQuery] = useState('')
  const [ppdResults, setPpdResults] = useState<{ path: string; label: string }[]>([])
  const [ppdPath, setPpdPath] = useState('')
  const [reason, setReason] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const existingUris = useMemo(() => new Set(printers.map((p) => p.deviceUri).filter(Boolean) as string[]), [printers])

  const scan = useCallback(async () => {
    setScanning(true)
    setRows([])
    try {
      const devices = await window.api.printers.discover()
      const enriched = await Promise.all(
        devices.map(async (device): Promise<DeviceRow> => {
          const resolved = await window.api.printers.resolveService(device.name, device.serviceType)
          const host = resolved.ip ?? resolved.host
          let openPorts: number[] = []
          if (host) openPorts = (await window.api.printers.probe(host)).filter((p) => p.open).map((p) => p.port)
          return {
            device,
            resolved,
            openPorts,
            reachable: host ? openPorts.length > 0 : undefined,
            alreadyAdded: resolved.suggestedUri ? existingUris.has(resolved.suggestedUri) : false
          }
        })
      )
      enriched.sort((a, b) => Number(b.reachable) - Number(a.reachable))
      setRows(enriched)
    } finally {
      setScanning(false)
    }
  }, [existingUris])

  useEffect(() => {
    if (open) {
      setRows([])
      setAdvanced(false)
      setIp('')
      setName('')
      setUri('')
      setDriverMode('auto')
      setPpdResults([])
      setPpdPath('')
      setReason(null)
      setHint(null)
      scan()
    }
  }, [open, scan])

  const doAdd = async (n: string, u: string, driver: DriverChoice) => {
    const res = await window.api.printers.add({ name: n, uri: u, driver })
    if (res.ok) {
      toast({ tone: 'ok', title: `Connected ${n}` })
      await refreshPrinters()
      onClose()
    } else {
      toast({ tone: 'error', title: 'Could not connect', detail: (res as any).hint || (res.stderr || res.stdout).trim() })
      if ((res as any).hint) setHint((res as any).hint)
    }
  }

  const connectDevice = async (row: DeviceRow) => {
    const r = row.resolved
    if (!r?.suggestedUri) {
      toast({ tone: 'error', title: 'Could not resolve device address' })
      return
    }
    setConnecting(row.device.name)
    try {
      const advertisesIpp = !!(r.airprint || r.advertisesIpp)
      const strat = await window.api.printers.chooseDriver({
        advertisesIpp,
        uri: r.suggestedUri,
        makeAndModelHint: r.model || row.device.name
      })
      if (strat.recommended) {
        await doAdd(clean(r.model || row.device.name), r.suggestedUri, strat.recommended)
      } else {
        // No driver — drop into advanced prefilled.
        setName(clean(r.model || row.device.name))
        setUri(r.suggestedUri)
        setDriverMode('ppd')
        setPpdResults(strat.matchingPpds)
        setReason(strat.reason)
        setAdvanced(true)
      }
    } finally {
      setConnecting(null)
    }
  }

  const detect = async () => {
    if (!ip.trim()) return
    setDetecting(true)
    setReason(null)
    try {
      const ports = await window.api.printers.probe(ip.trim())
      const open = ports.filter((p) => p.open)
      if (open.length === 0) {
        toast({ tone: 'error', title: 'Nothing responded', detail: `No printer ports open at ${ip}.` })
        return
      }
      const has = (p: number) => open.some((o) => o.port === p)
      const advertisesIpp = has(631)
      const u = has(631)
        ? `ipp://${ip}/ipp/print`
        : has(515)
          ? `lpd://${ip}/`
          : has(9100)
            ? `socket://${ip}:9100`
            : `lpd://${ip}/`
      setUri(u)
      if (!name) setName(`Printer_${ip.replace(/\./g, '_')}`)
      const strat = await window.api.printers.chooseDriver({ advertisesIpp, uri: u, makeAndModelHint: name })
      setReason(strat.reason)
      if (strat.matchingPpds.length) {
        setPpdResults(strat.matchingPpds)
        setDriverMode('ppd')
        setPpdPath(strat.matchingPpds[0].path)
      } else if (advertisesIpp) {
        setDriverMode('auto')
      }
    } finally {
      setDetecting(false)
    }
  }

  const searchPpds = async (q: string) => {
    setPpdQuery(q)
    if (q.trim().length < 2) return
    setPpdResults(await window.api.printers.findPpds(q))
  }

  const manualConnect = async () => {
    if (!name.trim() || !uri.trim()) {
      toast({ tone: 'error', title: 'Name and address required' })
      return
    }
    let driver: DriverChoice
    if (driverMode === 'everywhere') driver = { type: 'everywhere' }
    else if (driverMode === 'ppd') {
      if (!ppdPath) {
        toast({ tone: 'error', title: 'Pick a driver (PPD) first' })
        return
      }
      driver = { type: 'ppd', ppdPath }
    } else {
      const strat = await window.api.printers.chooseDriver({
        advertisesIpp: /^ipps?:/i.test(uri),
        uri,
        makeAndModelHint: name
      })
      if (!strat.recommended) {
        setReason(strat.reason)
        toast({ tone: 'error', title: 'No driver found', detail: strat.reason })
        return
      }
      driver = strat.recommended
    }
    setConnecting('manual')
    try {
      await doAdd(name.trim(), uri.trim(), driver)
    } finally {
      setConnecting(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Connect a printer" width="max-w-xl">
      {/* Auto-detected */}
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
          <Radar size={14} className="text-accent" /> On your network
        </span>
        <Button size="sm" variant="ghost" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
          {scanning ? 'Scanning…' : 'Rescan'}
        </Button>
      </div>

      <div className="min-h-[64px] space-y-1.5">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center text-[11.5px] text-faint">
            {scanning
              ? 'Browsing Bonjour/mDNS and probing devices…'
              : 'No printers found automatically. Driver-only printers (no AirPrint) often don’t broadcast — add one by IP below.'}
          </div>
        ) : (
          rows.map((row) => {
            const ipp = !!(row.resolved?.airprint || row.resolved?.advertisesIpp)
            return (
              <motion.div
                key={`${row.device.name}-${row.device.serviceType}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 p-2.5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-faint/10 text-muted">
                  <PrinterIcon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{row.resolved?.model || row.device.name}</span>
                    {row.reachable != null && (
                      <span className={cx('h-1.5 w-1.5 rounded-full', row.reachable ? 'bg-ok' : 'bg-faint')} />
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    {ipp ? (
                      <span className="flex items-center gap-0.5 rounded bg-accent/12 px-1 py-0.5 font-medium text-accent">
                        <Zap size={9} /> AirPrint
                      </span>
                    ) : (
                      <span className="rounded bg-faint/12 px-1 py-0.5 text-muted">{row.device.serviceType.replace(/^_|\._tcp$/g, '')}</span>
                    )}
                    {row.openPorts.length > 0 && <span className="text-faint">ports {row.openPorts.join(', ')}</span>}
                    {row.resolved?.ip && <span className="font-mono text-faint">{row.resolved.ip}</span>}
                  </div>
                </div>
                {row.alreadyAdded ? (
                  <span className="flex items-center gap-1 text-[11.5px] text-ok">
                    <Check size={13} /> Added
                  </span>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => connectDevice(row)} disabled={connecting === row.device.name}>
                    {connecting === row.device.name ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
                    Connect
                  </Button>
                )}
              </motion.div>
            )
          })
        )}
      </div>

      {/* Add by IP */}
      <div className="mt-4 rounded-xl border border-border/60 bg-surface/40 p-3">
        <div className="mb-2 text-[12px] font-medium text-ink">Add by IP address</div>
        <div className="flex gap-2">
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.16" onKeyDown={(e) => e.key === 'Enter' && detect()} />
          <Button variant="default" onClick={detect} disabled={detecting || !ip.trim()}>
            {detecting ? <Loader2 size={13} className="animate-spin" /> : 'Detect'}
          </Button>
        </div>
        {reason && <p className="mt-1.5 text-[11.5px] text-muted">{reason}</p>}

        {(uri || advanced) && (
          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Canon_PIXMA_G3000" />
              </Field>
              <Field label="Device URI">
                <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="lpd://192.168.1.16/" />
              </Field>
            </div>
            <Field label="Driver">
              <Select value={driverMode} onChange={(e) => setDriverMode(e.target.value as any)}>
                <option value="auto">Auto (recommended)</option>
                <option value="everywhere">IPP Everywhere (driverless)</option>
                <option value="ppd">Installed driver (PPD)…</option>
              </Select>
            </Field>
            {driverMode === 'ppd' && (
              <div>
                <Input value={ppdQuery} onChange={(e) => searchPpds(e.target.value)} placeholder="Search drivers (e.g. Canon G3000)…" className="mb-1.5" />
                <div className="max-h-28 overflow-y-auto rounded-lg border border-border/60">
                  {ppdResults.length === 0 ? (
                    <div className="px-3 py-2 text-[11.5px] text-faint">No matching drivers installed. Install the vendor driver, then search.</div>
                  ) : (
                    ppdResults.map((p) => (
                      <button
                        key={p.path}
                        onClick={() => setPpdPath(p.path)}
                        className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-faint/10', ppdPath === p.path && 'bg-accent/10')}
                      >
                        {ppdPath === p.path ? <Check size={12} className="text-accent" /> : <span className="w-3" />}
                        <span className="flex-1 truncate">{p.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={manualConnect} disabled={connecting === 'manual'}>
                {connecting === 'manual' ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
                Connect
              </Button>
            </div>
          </div>
        )}

        {!uri && !advanced && (
          <button onClick={() => setAdvanced(true)} className="mt-2 flex items-center gap-1 text-[11.5px] text-muted hover:text-ink">
            <ChevronDown size={12} /> Advanced (manual URI & driver)
          </button>
        )}
      </div>

      {hint && (
        <pre className="mt-3 flex items-start gap-2 whitespace-pre-wrap rounded-lg border border-warn/30 bg-warn/10 p-3 font-mono text-[11px] text-ink">
          <Terminal size={12} className="mt-0.5 shrink-0 text-warn" />
          {hint}
          <button onClick={() => navigator.clipboard.writeText(hint.split('sudo ')[1] ? 'sudo ' + hint.split('sudo ')[1] : hint)} className="ml-auto text-faint hover:text-ink">
            <Copy size={12} />
          </button>
        </pre>
      )}
    </Modal>
  )
}
