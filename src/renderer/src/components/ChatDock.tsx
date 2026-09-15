import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Paperclip,
  ArrowUp,
  X,
  FileText,
  Play,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Printer as PrinterIcon,
  Sparkles
} from 'lucide-react'
import { useStudio, type ChatMessage } from '../studio'
import { basename, fileExt, describeOptions } from '../lib/format'
import { cx } from './ui'

const EXAMPLES = ['double-sided, 2 copies', 'grayscale, pages 1–3', '4 per sheet, landscape', 'high quality, A4']

export function ChatDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { messages, files, attach, removeFile, addFiles, send, provider, thinking, status } = useStudio()
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  const submit = () => {
    if (!text.trim()) return
    send(text)
    setText('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

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

  return (
    <aside
      className="flex w-[380px] shrink-0 flex-col border-l border-border/50 bg-panel/40 backdrop-blur-xl"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="drag flex h-12 shrink-0 items-center gap-2 px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-white shadow-sm shadow-accent/30">
          <PrinterIcon size={13} />
        </div>
        <span className="text-[13px] font-semibold tracking-tight">Cursor for Printers</span>
        <button
          onClick={onOpenSettings}
          className="no-drag ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition hover:bg-faint/10 hover:text-ink"
        >
          <span className={cx('h-1.5 w-1.5 rounded-full', provider?.available ? 'bg-ok' : 'bg-danger')} />
          {provider?.name ?? 'No engine'}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Sparkles size={18} />
            </div>
            <div className="text-[13.5px] font-medium text-ink">Tell me what to print</div>
            <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed text-muted">
              Attach a document and describe the job in plain words. You’ll see the exact command before it runs.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setText(ex)
                    taRef.current?.focus()
                  }}
                  className="rounded-full border border-border/60 px-2.5 py-1 text-[11.5px] text-muted transition hover:border-faint/50 hover:text-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} m={m} />)
        )}
        {thinking && (
          <div className="flex items-center gap-2 px-1 text-[12px] text-muted">
            <Loader2 size={13} className="animate-spin" /> Interpreting…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="p-3">
        <div
          className={cx(
            'rounded-2xl bg-surface/80 backdrop-blur transition-all',
            dragOver ? 'ring-glow' : 'hairline'
          )}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {files.map((f) => (
                <span key={f} className="flex items-center gap-1.5 rounded-lg bg-faint/10 py-1 pl-2 pr-1 text-[11.5px]" title={f}>
                  <FileText size={11} className="text-accent" />
                  <span className="max-w-[140px] truncate">{basename(f)}</span>
                  {fileExt(f) && <span className="text-[9px] text-faint">{fileExt(f)}</span>}
                  <button className="rounded p-0.5 text-faint hover:bg-faint/20 hover:text-ink" onClick={() => removeFile(f)}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Describe what to print…"
            className="no-drag w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[13.5px] leading-relaxed text-ink placeholder:text-faint outline-none"
          />
          <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
            <button
              onClick={attach}
              title="Attach a file"
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-muted transition hover:bg-faint/10 hover:text-ink"
            >
              <Paperclip size={14} /> {files.length === 0 && 'Attach'}
            </button>
            <button
              onClick={submit}
              disabled={!text.trim() || status === 'printing'}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-sm shadow-accent/30 transition hover:brightness-110 active:scale-95 disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3 py-2 text-[13px] text-white">
          {m.text}
          {m.files && m.files.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.files.map((f) => (
                <span key={f} className="flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[10.5px]">
                  <FileText size={9} /> {basename(f)}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  if (m.result?.resolved && m.result.interpretation) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <ResolvedCard m={m} />
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-faint/10 px-3 py-2 text-[13px] text-ink">{m.text}</div>
    </motion.div>
  )
}

function ResolvedCard({ m }: { m: ChatMessage }) {
  const { run, active, status } = useStudio()
  const [copied, setCopied] = useState(false)
  const resolved = m.result!.resolved!
  const interp = m.result!.interpretation!
  const isActive = active?.resolved?.preview === resolved.preview
  const canRun = resolved.files.length > 0
  const chips = describeOptions(resolved.applied)

  const copy = async () => {
    await navigator.clipboard.writeText(resolved.preview)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="overflow-hidden rounded-2xl rounded-bl-md border border-border/70 bg-panel/70 backdrop-blur">
      <div className="px-3 py-2.5">
        <p className="text-[13px] leading-relaxed text-ink">{interp.summary}</p>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {resolved.applied.printer && (
              <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[10.5px] font-medium text-accent">→ {resolved.applied.printer}</span>
            )}
            {chips.map((c) => (
              <span key={c} className="rounded-md bg-faint/12 px-1.5 py-0.5 text-[10.5px] text-muted">{c}</span>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface/80 p-2 hairline">
          <span className="select-none pt-px font-mono text-[11px] text-accent">$</span>
          <code className="flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink">{resolved.preview}</code>
          <button onClick={copy} className="rounded p-0.5 text-faint hover:bg-faint/15 hover:text-ink">
            {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
          </button>
        </div>
        {resolved.warnings.map((w) => (
          <div key={w} className="mt-1.5 flex items-center gap-1 text-[11px] text-warn">
            <AlertTriangle size={11} /> {w}
          </div>
        ))}
      </div>
      {isActive && status !== 'done' && (
        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-3 py-2">
          <button
            onClick={run}
            disabled={!canRun || status === 'printing'}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {status === 'printing' ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} />}
            {status === 'printing' ? 'Printing…' : 'Run print'}
          </button>
        </div>
      )}
    </div>
  )
}
