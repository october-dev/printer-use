import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileUp,
  X,
  Sparkles,
  Play,
  Copy,
  Check,
  AlertTriangle,
  FileText,
  Loader2,
  Printer as PrinterIcon,
  ArrowRight
} from 'lucide-react'
import type { Printer, Provider, TranslateResult } from '@shared/types'
import { Button, Badge, cx, Select } from './ui'
import { useToast } from './toast'
import { basename, fileExt, describeOptions } from '../lib/format'

const EXAMPLES = [
  'print double-sided, 2 copies',
  'grayscale, pages 1–3 only',
  '4 pages per sheet, landscape',
  'one copy, high quality, A4'
]

export function CommandView({
  provider,
  onNeedProvider
}: {
  provider: Provider | null
  onNeedProvider: () => void
}) {
  const toast = useToast()
  const [files, setFiles] = useState<string[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [target, setTarget] = useState<string>('')
  const [text, setText] = useState('')
  const [translating, setTranslating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmBeforePrint, setConfirmBeforePrint] = useState(true)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const loadPrinters = useCallback(async () => {
    const list = await window.api.printers.list()
    setPrinters(list)
    setTarget((cur) => cur || list.find((p) => p.isDefault)?.name || list[0]?.name || '')
  }, [])

  useEffect(() => {
    loadPrinters()
    window.api.config.get().then((c) => setConfirmBeforePrint(c.confirmBeforePrint))
  }, [loadPrinters])

  const addFiles = useCallback((paths: string[]) => {
    setFiles((prev) => Array.from(new Set([...prev, ...paths])))
    setResult(null)
  }, [])

  const pick = async () => addFiles(await window.api.files.pick())

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths: string[] = []
    for (const f of Array.from(e.dataTransfer.files)) {
      // Electron exposes the absolute path on dropped File objects.
      const p = (f as unknown as { path?: string }).path
      if (p) paths.push(p)
    }
    if (paths.length) addFiles(paths)
  }

  const interpret = useCallback(async () => {
    if (!provider?.available) {
      onNeedProvider()
      return
    }
    if (!text.trim()) return
    setTranslating(true)
    setResult(null)
    try {
      const res = await window.api.nl.translate({
        userText: text.trim(),
        files,
        printers,
        defaultPrinter: printers.find((p) => p.isDefault)?.name,
        targetPrinter: target || undefined
      })
      setResult(res)
      if (!res.ok) toast({ tone: 'error', title: 'Could not interpret', detail: res.error })
    } catch (err) {
      toast({ tone: 'error', title: 'Interpretation failed', detail: String(err) })
    } finally {
      setTranslating(false)
    }
  }, [provider, text, files, printers, target, onNeedProvider, toast])

  const run = async () => {
    if (!result?.resolved) return
    if (confirmBeforePrint && !window.confirm(`Send this print job?\n\n${result.resolved.preview}`)) return
    setSubmitting(true)
    try {
      const res = await window.api.print.submit(result.resolved)
      if (res.ok) {
        toast({ tone: 'ok', title: 'Sent to printer', detail: res.stdout.trim() || result.resolved.preview })
        setResult(null)
        setText('')
      } else {
        toast({ tone: 'error', title: 'Print failed', detail: (res.stderr || res.stdout).trim() })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const copyCmd = async () => {
    if (!result?.resolved) return
    await navigator.clipboard.writeText(result.resolved.preview)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      interpret()
    }
  }

  const blockingWarnings = useMemo(
    () => result?.resolved?.warnings.filter((w) => w.toLowerCase().includes('no file')) ?? [],
    [result]
  )
  const canRun = !!result?.resolved && result.resolved.files.length > 0 && blockingWarnings.length === 0

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-16 pt-2">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">Print</h1>
        <p className="mt-1 text-[13px] text-muted">
          Describe what you want. Your AI engine resolves it to an exact command — you approve before it runs.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-panel p-4 shadow-sm">
        {/* Files */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx(
            'rounded-xl border border-dashed p-3 transition-colors',
            dragOver ? 'border-accent bg-accent/[0.06]' : 'border-border'
          )}
        >
          {files.length === 0 ? (
            <button
              onClick={pick}
              className="no-drag flex w-full items-center justify-center gap-2 py-3 text-[13px] text-muted hover:text-ink"
            >
              <FileUp size={16} />
              Drop a file here or <span className="font-medium text-accent">choose a file</span>
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <span
                  key={f}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-2 pr-1.5 text-[12px]"
                  title={f}
                >
                  <FileText size={13} className="text-accent" />
                  <span className="max-w-[180px] truncate">{basename(f)}</span>
                  {fileExt(f) && <Badge>{fileExt(f)}</Badge>}
                  <button
                    className="rounded p-0.5 text-faint hover:bg-faint/20 hover:text-ink"
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button onClick={pick} className="no-drag rounded-lg px-2 py-1.5 text-[12px] text-muted hover:bg-faint/10 hover:text-ink">
                + Add
              </button>
            </div>
          )}
        </div>

        {/* Prompt */}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="e.g. print this double-sided, 2 copies, grayscale"
          className="no-drag mt-3 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-3 text-[14px] leading-relaxed text-ink placeholder:text-faint outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
        />

        {/* Controls */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PrinterIcon size={14} className="shrink-0 text-muted" />
            {printers.length ? (
              <Select value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 max-w-[240px] py-0 text-[12.5px]">
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-[12px] text-faint">No printers — add one in Printers</span>
            )}
          </div>
          <Button variant="primary" onClick={interpret} disabled={translating || !text.trim()}>
            {translating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {translating ? 'Interpreting…' : 'Interpret'}
            <kbd className="ml-1 rounded bg-white/20 px-1 text-[10px] font-normal">⌘↵</kbd>
          </Button>
        </div>
      </div>

      {/* Example chips */}
      {!result && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setText(ex)
                taRef.current?.focus()
              }}
              className="rounded-full border border-border bg-panel px-2.5 py-1 text-[11.5px] text-muted transition hover:border-faint/60 hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Resolved command card — the trust surface */}
      {result?.ok && result.resolved && result.interpretation && (
        <div className="mt-5 animate-fade-in rounded-2xl border border-border bg-panel shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles size={14} className="text-accent" />
            <span className="text-[13px] font-medium">Resolved command</span>
            <span className="ml-auto text-[11px] text-faint">Review, then run</span>
          </div>

          <div className="p-4">
            <p className="text-[13.5px] leading-relaxed text-ink">{result.interpretation.summary}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.resolved.applied.printer && <Badge tone="accent">→ {result.resolved.applied.printer}</Badge>}
              {describeOptions(result.resolved.applied).map((d) => (
                <Badge key={d}>{d}</Badge>
              ))}
              {describeOptions(result.resolved.applied).length === 0 && !result.resolved.applied.printer && (
                <Badge>default options</Badge>
              )}
            </div>

            {/* The exact command */}
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
              <span className="select-none pt-0.5 font-mono text-[12px] text-accent">$</span>
              <code className="flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-ink">
                {result.resolved.preview}
              </code>
              <button onClick={copyCmd} className="no-drag rounded-md p-1 text-faint hover:bg-faint/15 hover:text-ink" title="Copy">
                {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
              </button>
            </div>

            {result.resolved.warnings.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {result.resolved.warnings.map((w) => (
                  <div key={w} className="flex items-center gap-1.5 text-[11.5px] text-warn">
                    <AlertTriangle size={12} /> {w}
                  </div>
                ))}
              </div>
            )}
            {result.interpretation.notes && (
              <p className="mt-2 text-[11.5px] italic text-muted">{result.interpretation.notes}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setResult(null)}>
                Dismiss
              </Button>
              <Button variant="primary" onClick={run} disabled={!canRun || submitting}>
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} />}
                {submitting ? 'Sending…' : 'Run print'}
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
