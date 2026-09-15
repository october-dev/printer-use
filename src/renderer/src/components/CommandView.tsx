import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Paperclip,
  X,
  Sparkles,
  Play,
  Copy,
  Check,
  AlertTriangle,
  FileText,
  Loader2,
  Printer as PrinterIcon,
  ChevronDown,
  ArrowRight
} from 'lucide-react'
import type { Printer, Provider, TranslateResult } from '@shared/types'
import { Button, Badge, cx } from './ui'
import { useToast } from './toast'
import { basename, fileExt, describeOptions } from '../lib/format'

const EXAMPLES = [
  'double-sided, 2 copies',
  'grayscale, pages 1–3',
  '4 per sheet, landscape',
  'high quality, A4'
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
  const [focused, setFocused] = useState(false)
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
      const p = window.api.files.pathForFile(f)
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
  const hasResult = !!result?.ok && !!result.resolved

  return (
    <div className="flex min-h-full w-full flex-col px-6">
      <div
        className={cx(
          'mx-auto flex w-full max-w-[600px] flex-1 flex-col',
          hasResult ? 'justify-start pt-10' : 'justify-center pb-16'
        )}
      >
        {/* Hero prompt line */}
        <div className="mb-5 text-center">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">What should I print?</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Describe it in plain words — you’ll see the exact command before anything runs.
          </p>
        </div>

        {/* Composer — the hero */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx(
            'relative rounded-[22px] bg-panel/70 backdrop-blur-xl transition-all duration-200',
            focused || dragOver ? 'ring-glow' : 'hairline shadow-[0_16px_50px_-30px_rgb(0_0_0_/_0.6)]'
          )}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[22px] bg-accent/[0.06] text-[13px] font-medium text-accent">
              Drop file to attach
            </div>
          )}

          {/* File chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
              {files.map((f) => (
                <span
                  key={f}
                  className="group flex items-center gap-1.5 rounded-lg bg-faint/10 py-1 pl-2 pr-1 text-[12px]"
                  title={f}
                >
                  <FileText size={12} className="text-accent" />
                  <span className="max-w-[180px] truncate">{basename(f)}</span>
                  {fileExt(f) && <span className="text-[10px] text-faint">{fileExt(f)}</span>}
                  <button
                    className="rounded p-0.5 text-faint hover:bg-faint/20 hover:text-ink"
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Prompt */}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={2}
            placeholder="e.g. print this double-sided, 2 copies, grayscale"
            className="no-drag w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-relaxed text-ink placeholder:text-faint/80 outline-none"
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
            <div className="flex min-w-0 items-center gap-1">
              <button
                onClick={pick}
                title="Attach a file"
                className="no-drag flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-muted transition hover:bg-faint/10 hover:text-ink"
              >
                <Paperclip size={14} />
                {files.length === 0 && <span>Attach</span>}
              </button>

              {printers.length > 0 ? (
                <div className="no-drag relative flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-muted transition hover:bg-faint/10 hover:text-ink">
                  <PrinterIcon size={14} />
                  <span className="max-w-[150px] truncate text-ink">{target}</span>
                  <ChevronDown size={12} className="text-faint" />
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                        {p.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="px-1.5 text-[12px] text-faint">No printer yet</span>
              )}
            </div>

            <Button variant="primary" size="sm" onClick={interpret} disabled={translating || !text.trim()}>
              {translating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {translating ? 'Reading…' : 'Interpret'}
              <kbd className="ml-0.5 rounded bg-white/20 px-1 text-[10px] font-normal">⌘↵</kbd>
            </Button>
          </div>
        </div>

        {/* Example chips */}
        {!hasResult && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setText((t) => (t.trim() ? t : ex))
                  taRef.current?.focus()
                }}
                className="rounded-full px-3 py-1 text-[12px] text-muted transition hover:bg-faint/10 hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Resolved command — the trust surface */}
        {hasResult && result.interpretation && (
          <div className="mt-4 animate-fade-in overflow-hidden rounded-[20px] bg-panel/70 backdrop-blur-xl hairline">
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15 text-accent">
                <Sparkles size={12} />
              </span>
              <span className="text-[13px] font-medium">Resolved command</span>
              <span className="ml-auto text-[11px] text-faint">Review, then run</span>
            </div>

            <div className="px-4 pb-4">
              <p className="text-[14px] leading-relaxed text-ink">{result.interpretation.summary}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.resolved!.applied.printer && <Badge tone="accent">→ {result.resolved!.applied.printer}</Badge>}
                {describeOptions(result.resolved!.applied).map((d) => (
                  <Badge key={d}>{d}</Badge>
                ))}
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface/80 p-3 hairline">
                <span className="select-none pt-0.5 font-mono text-[12px] text-accent">$</span>
                <code className="flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-ink">
                  {result.resolved!.preview}
                </code>
                <button onClick={copyCmd} className="no-drag rounded-md p-1 text-faint hover:bg-faint/15 hover:text-ink" title="Copy">
                  {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
                </button>
              </div>

              {result.resolved!.warnings.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  {result.resolved!.warnings.map((w) => (
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
                <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                  Dismiss
                </Button>
                <Button variant="primary" size="sm" onClick={run} disabled={!canRun || submitting}>
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />}
                  {submitting ? 'Sending…' : 'Run print'}
                  <ArrowRight size={13} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
