import React, { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cx } from './ui'

type ToastTone = 'ok' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 4200)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id))

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[340px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-elevated px-3.5 py-3 shadow-lg animate-fade-in"
          >
            <span className="mt-0.5">
              {t.tone === 'ok' ? (
                <CheckCircle2 size={16} className="text-ok" />
              ) : t.tone === 'error' ? (
                <AlertTriangle size={16} className="text-danger" />
              ) : (
                <Info size={16} className="text-accent" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-ink">{t.title}</div>
              {t.detail && <div className="mt-0.5 whitespace-pre-wrap break-words text-[11.5px] text-muted">{t.detail}</div>}
            </div>
            <button className={cx('text-faint hover:text-ink')} onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
