import { motion, AnimatePresence } from 'framer-motion'
import { FileText } from 'lucide-react'
import type { StudioStatus } from '../studio'
import { basename, fileExt } from '../lib/format'

/**
 * The visual stage: a minimal printer with the selected document floating above,
 * animating through idle → printing → done. Pure SVG + framer-motion.
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
  const hasDoc = !!file

  return (
    <div className="relative mx-auto h-[300px] w-[300px] select-none">
      {/* soft ground shadow */}
      <div className="absolute bottom-[46px] left-1/2 h-6 w-[200px] -translate-x-1/2 rounded-[100%] bg-black/25 blur-xl dark:bg-black/50" />

      {/* Output sheet (emerges from the front tray) */}
      <AnimatePresence>
        {(printing || done) && (
          <motion.div
            key="out"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: -54, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: printing ? 0.5 : 0 }}
            className="absolute left-1/2 top-[150px] z-[15] -translate-x-1/2"
          >
            <Page small />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Printer body */}
      <svg viewBox="0 0 300 200" className="absolute left-0 top-[92px] z-20 w-full drop-shadow-sm">
        {/* rear paper tray */}
        <rect x="86" y="4" width="128" height="34" rx="8" className="fill-panel stroke-border" strokeWidth="1.5" />
        {/* body */}
        <rect x="54" y="34" width="192" height="96" rx="18" className="fill-elevated stroke-border" strokeWidth="1.5" />
        {/* top surface highlight */}
        <rect x="70" y="46" width="160" height="7" rx="3.5" className="fill-surface" />
        {/* control cluster */}
        <rect x="150" y="64" width="66" height="5" rx="2.5" className="fill-surface" />
        <rect x="150" y="74" width="42" height="5" rx="2.5" className="fill-surface" />
        {/* status LED */}
        <motion.circle
          cx="90"
          cy="72"
          r="5"
          className={
            status === 'error' ? 'fill-danger' : !accepting ? 'fill-warn' : printing ? 'fill-accent' : 'fill-ok'
          }
          animate={printing ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
          transition={printing ? { duration: 0.9, repeat: Infinity } : {}}
        />
        {/* front output slot */}
        <rect x="74" y="104" width="152" height="8" rx="4" className="fill-surface" />
        <rect x="74" y="104" width="152" height="3" rx="1.5" className="fill-black/20" />
        {/* feet */}
        <rect x="72" y="130" width="16" height="8" rx="3" className="fill-border" />
        <rect x="212" y="130" width="16" height="8" rx="3" className="fill-border" />
      </svg>

      {/* Input document (floats above; feeds in when printing) */}
      <AnimatePresence>
        {hasDoc && !done && (
          <motion.div
            key="in"
            initial={{ y: -8, opacity: 0, scale: 0.96 }}
            animate={
              printing
                ? { y: 60, opacity: 0, scale: 0.8 }
                : { y: [0, -7, 0], opacity: 1, scale: 1 }
            }
            exit={{ opacity: 0 }}
            transition={
              printing
                ? { duration: 0.9, ease: 'easeIn' }
                : { y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.4 }, scale: { duration: 0.4 } }
            }
            className="absolute left-1/2 top-[10px] z-30 -translate-x-1/2"
          >
            <Page label={basename(file!)} ext={fileExt(file!)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Page({ label, ext, small }: { label?: string; ext?: string; small?: boolean }) {
  const w = small ? 104 : 116
  const h = small ? 132 : 148
  return (
    <div
      className="relative rounded-[10px] bg-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/5"
      style={{ width: w, height: h }}
    >
      <div className="flex h-full flex-col gap-[6px] p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-accent/15 text-accent">
            <FileText size={10} />
          </span>
          {ext && <span className="text-[8px] font-semibold tracking-wide text-neutral-400">{ext}</span>}
        </div>
        {[0.9, 0.7, 0.85, 0.55, 0.8, 0.4].map((wd, i) => (
          <div key={i} className="h-[4px] rounded-full bg-neutral-200" style={{ width: `${wd * 100}%` }} />
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
