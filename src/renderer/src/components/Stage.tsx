import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Plus,
  ListChecks,
  Settings as SettingsIcon,
  Printer as PrinterIcon,
  Play,
  Loader2,
  Check,
  ArrowRight,
  Sparkles
} from 'lucide-react'
import { useStudio } from '../studio'
import { PrinterScene } from './PrinterScene'
import { describeOptions } from '../lib/format'
import { cx } from './ui'

export function Stage({
  onOpenQueue,
  onOpenAddPrinter,
  onOpenSettings
}: {
  onOpenQueue: () => void
  onOpenAddPrinter: () => void
  onOpenSettings: () => void
}) {
  const { printers, selectedPrinter, setPrinter, printerObj, primaryFile, active, status, run, jobs } = useStudio()

  const stateTone: 'ok' | 'warn' | 'danger' | 'accent' | 'muted' =
    status === 'error' || printerObj?.state === 'stopped'
      ? 'danger'
      : status === 'printing'
        ? 'accent'
        : !printerObj
          ? 'muted'
          : !printerObj.accepting
            ? 'warn'
            : 'ok'
  const stateText =
    status === 'printing'
      ? 'Printing…'
      : status === 'done'
        ? 'Done'
        : status === 'thinking'
          ? 'Thinking…'
          : printerObj
            ? printerObj.accepting
              ? printerObj.state
              : 'not accepting'
            : 'no printer'

  const chips = active?.resolved ? describeOptions(active.resolved.applied) : []
  const showChips = (status === 'ready' || status === 'printing' || status === 'done') && chips.length > 0

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="drag flex h-12 shrink-0 items-center justify-between pl-[84px] pr-3">
        {/* Printer switcher */}
        {printers.length > 0 ? (
          <div className="no-drag relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-faint/10">
            <span className={cx('h-2 w-2 rounded-full', dotClass(stateTone))} />
            <PrinterIcon size={14} className="text-muted" />
            <span className="max-w-[220px] truncate text-[13px] font-medium text-ink">{selectedPrinter}</span>
            <ChevronDown size={13} className="text-faint" />
            <select
              value={selectedPrinter}
              onChange={(e) => setPrinter(e.target.value)}
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
          <button onClick={onOpenAddPrinter} className="no-drag flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-muted hover:bg-faint/10 hover:text-ink">
            <Plus size={14} /> Add a printer
          </button>
        )}

        <div className="no-drag flex items-center gap-0.5">
          <ToolbarButton onClick={onOpenAddPrinter} label="Add printer">
            <Plus size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={onOpenQueue} label="Queue" badge={jobs.length || undefined}>
            <ListChecks size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={onOpenSettings} label="Settings">
            <SettingsIcon size={16} />
          </ToolbarButton>
        </div>
      </div>

      {/* Stage center */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-8">
        <PrinterScene status={status} file={primaryFile} accepting={printerObj?.accepting ?? true} />

        {/* State line */}
        <div className="mt-1 flex items-center gap-2">
          <span className={cx('h-2 w-2 rounded-full', dotClass(stateTone), status === 'printing' && 'animate-pulse')} />
          <span className="text-[13px] font-medium capitalize text-ink">{stateText}</span>
          {printerObj?.deviceUri && status !== 'printing' && (
            <span className="font-mono text-[11px] text-faint">· {printerObj.deviceUri}</span>
          )}
        </div>

        {/* Settings chips */}
        <div className="mt-4 flex min-h-[26px] flex-wrap items-center justify-center gap-1.5">
          <AnimatePresence>
            {showChips &&
              chips.map((c, i) => (
                <motion.span
                  key={c}
                  initial={{ opacity: 0, y: 6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 380, damping: 26 }}
                  className="rounded-full border border-border/70 bg-panel/70 px-2.5 py-1 text-[11.5px] font-medium text-ink backdrop-blur"
                >
                  {c}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>

        {/* Action / hint */}
        <div className="mt-5 h-11">
          <AnimatePresence mode="wait">
            {status === 'ready' && active?.resolved ? (
              <motion.button
                key="run"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                onClick={run}
                disabled={active.resolved.files.length === 0}
                className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-medium text-white shadow-lg shadow-accent/30 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
              >
                <Play size={15} /> Run print
                <ArrowRight size={15} />
              </motion.button>
            ) : status === 'printing' ? (
              <motion.div key="printing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[13px] text-accent">
                <Loader2 size={15} className="animate-spin" /> Sending to printer…
              </motion.div>
            ) : status === 'done' ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[13px] font-medium text-ok">
                <Check size={16} /> Sent to printer
              </motion.div>
            ) : (
              <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[12.5px] text-faint">
                <Sparkles size={13} />
                {!primaryFile ? 'Attach a document and ask on the right' : 'Describe how to print it →'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function ToolbarButton({
  children,
  onClick,
  label,
  badge
}: {
  children: ReactNode
  onClick: () => void
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-faint/12 hover:text-ink"
    >
      {children}
      {badge != null && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

function dotClass(tone: 'ok' | 'warn' | 'danger' | 'accent' | 'muted') {
  return { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', accent: 'bg-accent', muted: 'bg-faint' }[tone]
}
