import { motion } from 'framer-motion'
import { X, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useStudio } from '../studio'
import { Modal, cx } from './ui'
import { bytes } from '../lib/format'
import type { PrintJob } from '@shared/types'

function tone(state: PrintJob['state']): string {
  switch (state) {
    case 'processing':
      return 'bg-accent/12 text-accent'
    case 'pending':
    case 'held':
      return 'bg-warn/15 text-warn'
    case 'completed':
      return 'bg-ok/12 text-ok'
    default:
      return 'bg-danger/12 text-danger'
  }
}

export function QueueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { jobs, cancelJob } = useStudio()
  const [canceling, setCanceling] = useState<string | null>(null)

  const cancel = async (id: string) => {
    setCanceling(id)
    try {
      await cancelJob(id)
    } finally {
      setCanceling(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Print queue" width="max-w-lg">
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ok/10 text-ok ring-1 ring-ok/15">
            <CheckCircle2 size={22} />
          </div>
          <div className="text-[14px] font-medium">All clear</div>
          <p className="mt-1 text-[12px] text-muted">No active jobs right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-faint/10 text-muted">
                <FileText size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12.5px] font-medium text-ink">{job.title}</span>
                  <span className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-medium', tone(job.state))}>{job.state}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-faint">
                  <span className="font-mono">{job.printer}</span>
                  <span>#{job.jobNumber}</span>
                  {job.sizeBytes != null && <span>{bytes(job.sizeBytes)}</span>}
                </div>
              </div>
              <button
                onClick={() => cancel(job.id)}
                disabled={canceling === job.id}
                className="flex items-center gap-1 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] font-medium text-danger transition hover:bg-danger/20"
              >
                {canceling === job.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Cancel
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </Modal>
  )
}
