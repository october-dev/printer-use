import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, X, ListChecks, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import type { PrintJob } from '@shared/types'
import { Button, Badge, cx } from './ui'
import { useToast } from './toast'
import { bytes } from '../lib/format'

function jobTone(state: PrintJob['state']): 'ok' | 'warn' | 'danger' | 'accent' | 'default' {
  switch (state) {
    case 'processing':
      return 'accent'
    case 'pending':
    case 'held':
      return 'warn'
    case 'completed':
      return 'ok'
    case 'canceled':
    case 'aborted':
    case 'stopped':
      return 'danger'
    default:
      return 'default'
  }
}

export function QueueView() {
  const toast = useToast()
  const [jobs, setJobs] = useState<PrintJob[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [canceling, setCanceling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setJobs(await window.api.jobs.list())
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 3500)
    return () => clearInterval(t)
  }, [load])

  const cancel = async (job: PrintJob) => {
    setCanceling(job.id)
    try {
      const res = await window.api.jobs.cancel(job.id)
      if (res.ok) {
        toast({ tone: 'ok', title: `Canceled job ${job.jobNumber}` })
        load()
      } else {
        toast({ tone: 'error', title: 'Could not cancel', detail: res.stderr.trim() })
      }
    } finally {
      setCanceling(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-16 pt-2">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Queue</h1>
          <p className="mt-1 text-[13px] text-muted">Active print jobs across all printers.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw size={14} className={cx(refreshing && 'animate-spin')} />
        </Button>
      </header>

      {jobs === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-[58px] rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-faint/10 text-muted">
            <CheckCircle2 size={20} />
          </div>
          <div className="text-[14px] font-medium">Queue is empty</div>
          <p className="mt-1 text-[12.5px] text-muted">No active jobs. New print jobs will show up here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          {jobs.map((job, i) => (
            <div
              key={job.id}
              className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-faint/10 text-muted">
                <FileText size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{job.title}</span>
                  <Badge tone={jobTone(job.state)}>{job.state}</Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11.5px] text-faint">
                  <span className="font-mono">{job.printer}</span>
                  <span>·</span>
                  <span>#{job.jobNumber}</span>
                  {job.sizeBytes != null && (
                    <>
                      <span>·</span>
                      <span>{bytes(job.sizeBytes)}</span>
                    </>
                  )}
                  {job.submittedAt && (
                    <>
                      <span>·</span>
                      <span className="truncate">{job.submittedAt}</span>
                    </>
                  )}
                </div>
              </div>
              <Button size="sm" variant="danger" onClick={() => cancel(job)} disabled={canceling === job.id}>
                {canceling === job.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-faint">
          <ListChecks size={12} /> {jobs.length} active {jobs.length === 1 ? 'job' : 'jobs'} · auto-refreshing
        </div>
      )}
    </div>
  )
}
