import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig, Provider, Printer, PrintJob, TranslateResult } from '@shared/types'
import { useToast } from './components/toast'

export type StudioStatus = 'idle' | 'thinking' | 'ready' | 'printing' | 'done' | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  files?: string[]
  result?: TranslateResult
  ts: number
}

interface StudioValue {
  config: AppConfig | null
  providers: Provider[]
  provider: Provider | null
  printers: Printer[]
  selectedPrinter: string
  printerObj: Printer | undefined
  files: string[]
  primaryFile: string | undefined
  messages: ChatMessage[]
  active: TranslateResult | null
  status: StudioStatus
  jobs: PrintJob[]
  thinking: boolean
  printing: boolean

  refreshConfig: () => Promise<void>
  refreshPrinters: () => Promise<void>
  refreshJobs: () => Promise<void>
  attach: () => Promise<void>
  addFiles: (paths: string[]) => void
  removeFile: (f: string) => void
  clearFiles: () => void
  setPrinter: (name: string) => Promise<void>
  send: (text: string) => Promise<void>
  run: () => Promise<void>
  dismissActive: () => void
  cancelJob: (id: string) => Promise<void>
}

const DEMO = new URLSearchParams(window.location.search).get('demo') === '1'

const Ctx = createContext<StudioValue | null>(null)
export const useStudio = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStudio outside provider')
  return v
}

let idSeq = 0
const nextId = () => `${Date.now()}-${idSeq++}`

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [active, setActive] = useState<TranslateResult | null>(null)
  const [status, setStatus] = useState<StudioStatus>('idle')
  const [jobs, setJobs] = useState<PrintJob[]>([])
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const provider = useMemo(
    () => providers.find((p) => p.id === config?.selectedProviderId) ?? null,
    [providers, config]
  )
  const printerObj = useMemo(
    () => printers.find((p) => p.name === selectedPrinter),
    [printers, selectedPrinter]
  )

  const refreshConfig = useCallback(async () => {
    const [cfg, provs] = await Promise.all([window.api.config.get(), window.api.providers.list()])
    setConfig(cfg)
    setProviders(provs)
  }, [])

  const refreshPrinters = useCallback(async () => {
    const list = await window.api.printers.list()
    setPrinters(list)
    setSelectedPrinter((cur) => cur || list.find((p) => p.isDefault)?.name || list[0]?.name || '')
  }, [])

  const refreshJobs = useCallback(async () => {
    setJobs(await window.api.jobs.list())
  }, [])

  useEffect(() => {
    refreshConfig()
    if (DEMO) {
      seedDemo()
      return
    }
    refreshPrinters()
    refreshJobs()
    const t = setInterval(() => {
      refreshPrinters()
      refreshJobs()
    }, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshConfig, refreshPrinters, refreshJobs])

  // Dev-only visual demo state (?demo=1) so the full flow can be previewed
  // without a configured printer or a live AI round-trip.
  function seedDemo() {
    const file = '/Users/harsh/Documents/quarterly-report.pdf'
    const applied = {
      printer: 'Canon_PIXMA_G3000',
      copies: 2,
      sides: 'two-sided-long-edge' as const,
      color: 'monochrome' as const,
      pageRanges: '1-3'
    }
    const resolved = {
      bin: 'lp',
      args: [],
      preview:
        'lp -d Canon_PIXMA_G3000 -n 2 -o sides=two-sided-long-edge -o print-color-mode=monochrome -o page-ranges=1-3 quarterly-report.pdf',
      applied,
      files: [file],
      warnings: [] as string[]
    }
    const interpretation = {
      options: applied,
      summary: 'Print pages 1–3 of quarterly-report.pdf on Canon PIXMA G3000 — 2 copies, double-sided, grayscale.'
    }
    setPrinters([
      {
        name: 'Canon_PIXMA_G3000',
        state: 'idle',
        accepting: true,
        isDefault: true,
        deviceUri: 'lpd://192.168.1.16/',
        location: 'Office'
      }
    ])
    setSelectedPrinter('Canon_PIXMA_G3000')
    setFiles([file])
    setMessages([
      { id: 'd1', role: 'user', text: 'print this double-sided, 2 copies, grayscale, pages 1-3', files: [file], ts: 0 },
      { id: 'd2', role: 'assistant', result: { ok: true, resolved, interpretation }, text: interpretation.summary, ts: 1 }
    ])
    setActive({ ok: true, resolved, interpretation })
    setStatus('ready')
  }

  const pushMessage = useCallback((m: Omit<ChatMessage, 'id' | 'ts'>) => {
    setMessages((prev) => [...prev, { ...m, id: nextId(), ts: Date.now() }])
  }, [])

  const addFiles = useCallback((paths: string[]) => {
    setFiles((prev) => Array.from(new Set([...prev, ...paths])))
  }, [])
  const attach = useCallback(async () => {
    addFiles(await window.api.files.pick())
  }, [addFiles])
  const removeFile = useCallback((f: string) => setFiles((prev) => prev.filter((x) => x !== f)), [])
  const clearFiles = useCallback(() => setFiles([]), [])

  const setPrinter = useCallback(
    async (name: string) => {
      setSelectedPrinter(name)
      const res = await window.api.printers.setDefault(name)
      if (res.ok) refreshPrinters()
    },
    [refreshPrinters]
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const snapshot = [...files]
      pushMessage({ role: 'user', text: trimmed, files: snapshot })
      if (!provider?.available) {
        pushMessage({ role: 'assistant', text: `No AI engine is connected. Open Settings to pick one.` })
        setStatus('error')
        return
      }
      setStatus('thinking')
      setActive(null)
      try {
        const res = await window.api.nl.translate({
          userText: trimmed,
          files: snapshot,
          printers,
          defaultPrinter: printers.find((p) => p.isDefault)?.name,
          targetPrinter: selectedPrinter || undefined
        })
        if (res.ok) {
          setActive(res)
          pushMessage({ role: 'assistant', result: res, text: res.interpretation?.summary })
          setStatus('ready')
        } else {
          pushMessage({ role: 'assistant', text: res.error ?? 'I could not interpret that.' })
          setStatus('error')
        }
      } catch (err) {
        pushMessage({ role: 'assistant', text: String(err) })
        setStatus('error')
      }
    },
    [files, provider, printers, selectedPrinter, pushMessage]
  )

  const run = useCallback(async () => {
    if (!active?.resolved) return
    if (config?.confirmBeforePrint && !window.confirm(`Send this print job?\n\n${active.resolved.preview}`)) return
    if (statusTimer.current) clearTimeout(statusTimer.current)
    setStatus('printing')
    try {
      const res = await window.api.print.submit(active.resolved)
      if (res.ok) {
        setStatus('done')
        pushMessage({
          role: 'assistant',
          text: `Sent to ${active.resolved.applied.printer ?? 'the printer'}. ${res.stdout.trim()}`.trim()
        })
        toast({ tone: 'ok', title: 'Sent to printer', detail: res.stdout.trim() || active.resolved.preview })
        refreshJobs()
        statusTimer.current = setTimeout(() => {
          setStatus('idle')
          setActive(null)
        }, 2600)
      } else {
        setStatus('error')
        pushMessage({ role: 'assistant', text: (res.stderr || res.stdout).trim() || 'Print failed.' })
        toast({ tone: 'error', title: 'Print failed', detail: (res.stderr || res.stdout).trim() })
      }
    } catch (err) {
      setStatus('error')
      toast({ tone: 'error', title: 'Print failed', detail: String(err) })
    }
  }, [active, config, pushMessage, refreshJobs, toast])

  const dismissActive = useCallback(() => {
    setActive(null)
    setStatus('idle')
  }, [])

  const cancelJob = useCallback(
    async (id: string) => {
      const res = await window.api.jobs.cancel(id)
      if (res.ok) {
        toast({ tone: 'ok', title: `Canceled job` })
        refreshJobs()
      } else {
        toast({ tone: 'error', title: 'Could not cancel', detail: res.stderr.trim() })
      }
    },
    [refreshJobs, toast]
  )

  const value: StudioValue = {
    config,
    providers,
    provider,
    printers,
    selectedPrinter,
    printerObj,
    files,
    primaryFile: files[0],
    messages,
    active,
    status,
    jobs,
    thinking: status === 'thinking',
    printing: status === 'printing',
    refreshConfig,
    refreshPrinters,
    refreshJobs,
    attach,
    addFiles,
    removeFile,
    clearFiles,
    setPrinter,
    send,
    run,
    dismissActive,
    cancelJob
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
