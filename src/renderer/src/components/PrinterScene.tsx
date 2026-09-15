import { motion, AnimatePresence } from 'framer-motion'
import { FileText } from 'lucide-react'
import type { StudioStatus } from '../studio'
import { basename, fileExt } from '../lib/format'

// Scene geometry (px within a 320×360 stage).
const SLOT_Y = 214
const SHEET_W = 118
const SHEET_H = 150
const CLIP_H = SHEET_H + 10
const HIDDEN_Y = -(SHEET_H + 12) // fully inside the printer
const OUT_Y = -14 // mostly ejected, top edge still in the slot

/**
 * Animated print stage. The printed sheet emerges from the front output slot with
 * true occlusion (a slot-clipped container), revealing its content top-first the
 * way a real printer lays down ink line by line. Pure SVG + framer-motion.
 */
export function PrinterScene({
  status,
  file,
  accepting
}: {
  status: StudioStatus
  file: string | undefined
  accepting: boolean
}) {
  const printing = status === 'printing'
  const done = status === 'done'
  const emerging = printing || done
  const hasDoc = !!file

  return (
    <div className="relative mx-auto select-none" style={{ width: 320, height: 360 }}>
      {/* ground shadow */}
      <div className="absolute left-1/2 h-6 w-[210px] -translate-x-1/2 rounded-[100%] bg-black/25 blur-xl dark:bg-black/50" style={{ top: 300 }} />

      {/* Emerging printed sheet — clipped to the slot so it appears to come out of it */}
      <div
        className="absolute z-[24] overflow-hidden"
        style={{ top: SLOT_Y, left: (320 - SHEET_W) / 2, width: SHEET_W, height: CLIP_H }}
      >
        <motion.div
          initial={{ y: HIDDEN_Y }}
          animate={{ y: emerging ? OUT_Y : HIDDEN_Y }}
          transition={
            printing
              ? { duration: 2.5, ease: [0.65, 0.02, 0.36, 1], delay: 0.55 }
              : done
                ? { type: 'spring', stiffness: 120, damping: 16 }
                : { duration: 0.3 }
          }
          style={{ transformOrigin: 'top center' }}
        >
          <PrintedPage />
        </motion.div>
      </div>

      {/* Printer body (drawn over the lower part of the emerging sheet's origin) */}
      <motion.svg
        viewBox="0 0 320 360"
        className="absolute inset-0 z-20 h-full w-full drop-shadow-sm"
        animate={printing ? { y: [0, -0.7, 0.7, 0] } : { y: 0 }}
        transition={printing ? { duration: 0.16, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
      >
        {/* rear paper tray */}
        <rect x="96" y="120" width="128" height="34" rx="8" className="fill-panel stroke-border" strokeWidth="1.5" />
        {/* feed rollers hint */}
        <motion.g animate={printing ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.5 }} transition={printing ? { duration: 0.6, repeat: Infinity } : {}}>
          <rect x="120" y="132" width="80" height="3" rx="1.5" className="fill-faint" />
        </motion.g>

        {/* body */}
        <rect x="60" y="150" width="200" height="96" rx="18" className="fill-elevated stroke-border" strokeWidth="1.5" />
        {/* top surface highlight */}
        <rect x="78" y="162" width="164" height="7" rx="3.5" className="fill-surface" />
        {/* control cluster */}
        <rect x="156" y="180" width="70" height="5" rx="2.5" className="fill-surface" />
        <rect x="156" y="190" width="44" height="5" rx="2.5" className="fill-surface" />
        {/* status LED */}
        <motion.circle
          cx="96"
          cy="188"
          r="5"
          className={status === 'error' ? 'fill-danger' : !accepting ? 'fill-warn' : printing ? 'fill-accent' : 'fill-ok'}
          animate={printing ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
          transition={printing ? { duration: 0.85, repeat: Infinity } : {}}
        />
        {/* front output slot (recessed) */}
        <rect x="82" y={SLOT_Y - 6} width="156" height="10" rx="5" className="fill-surface" />
        <rect x="82" y={SLOT_Y - 6} width="156" height="3.5" rx="1.75" className="fill-black/25" />
        {/* feet */}
        <rect x="80" y="246" width="16" height="9" rx="3" className="fill-border" />
        <rect x="224" y="246" width="16" height="9" rx="3" className="fill-border" />
      </motion.svg>

      {/* slot lip drawn on top of the emerging sheet for a crisp exit edge */}
      <div className="absolute z-[26]" style={{ top: SLOT_Y - 6, left: 82, width: 156, height: 6 }}>
        <div className="h-full w-full rounded-t-md bg-gradient-to-b from-transparent to-black/10" />
        {/* print-head scan glow while printing */}
        <AnimatePresence>
          {printing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.2, 0.9, 0.2] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute inset-x-3 bottom-0 h-[2px] rounded-full"
              style={{ background: 'rgb(var(--accent))', boxShadow: '0 0 10px 1px rgb(var(--accent))' }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Input document — floats above; feeds into the top on print */}
      <AnimatePresence>
        {hasDoc && !emerging && (
          <motion.div
            key="in"
            initial={{ y: -6, opacity: 0, scale: 0.96 }}
            animate={{ y: [0, -7, 0], opacity: 1, scale: 1 }}
            exit={{ y: 96, opacity: 0, scale: 0.8, transition: { duration: 0.8, ease: 'easeIn' } }}
            transition={{ y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.4 }, scale: { duration: 0.4 } }}
            className="absolute left-1/2 z-30 -translate-x-1/2"
            style={{ top: 16 }}
          >
            <DocCard label={basename(file!)} ext={fileExt(file!)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The document that floats above the printer, ready to print. */
function DocCard({ label, ext }: { label: string; ext: string }) {
  return (
    <div
      className="relative rounded-[11px] bg-white shadow-[0_14px_34px_-10px_rgba(0,0,0,0.4)] ring-1 ring-black/5"
      style={{ width: 116, height: 146 }}
    >
      <div className="flex h-full flex-col gap-[6px] p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-accent/15 text-accent">
            <FileText size={10} />
          </span>
          {ext && <span className="text-[8px] font-semibold tracking-wide text-neutral-400">{ext}</span>}
        </div>
        {[0.9, 0.7, 0.85, 0.55, 0.8, 0.4].map((w, i) => (
          <div key={i} className="h-[4px] rounded-full bg-neutral-200" style={{ width: `${w * 100}%` }} />
        ))}
        {label && (
          <div className="mt-auto truncate text-[8.5px] font-medium text-neutral-500" title={label}>
            {label}
          </div>
        )}
      </div>
    </div>
  )
}

/** The printed sheet that emerges from the slot — a fuller page of "printed" content. */
function PrintedPage() {
  const lines = [0.95, 0.6, 0.88, 0.72, 0.9, 0.5, 0.82, 0.66, 0.94, 0.58, 0.78]
  return (
    <div
      className="rounded-b-[10px] bg-white shadow-[0_18px_28px_-14px_rgba(0,0,0,0.45)] ring-1 ring-black/5"
      style={{ width: SHEET_W, height: SHEET_H }}
    >
      <div className="flex h-full flex-col gap-[5px] px-3.5 pb-3 pt-3">
        <div className="mb-1 h-[9px] w-1/2 rounded bg-neutral-300" />
        {lines.map((w, i) => (
          <div key={i} className="h-[3.5px] rounded-full bg-neutral-200" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  )
}
