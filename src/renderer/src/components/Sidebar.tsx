import { Printer as PrinterIcon, Sparkles, ListChecks, Settings, Zap } from 'lucide-react'
import type { Provider } from '@shared/types'
import { cx, StatusDot } from './ui'

export type View = 'print' | 'printers' | 'queue'

const NAV: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: 'print', label: 'Print', icon: Sparkles },
  { id: 'printers', label: 'Printers', icon: PrinterIcon },
  { id: 'queue', label: 'Queue', icon: ListChecks }
]

export function Sidebar({
  view,
  onView,
  provider,
  onOpenSettings
}: {
  view: View
  onView: (v: View) => void
  provider: Provider | null
  onOpenSettings: () => void
}) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="drag flex h-11 items-center pl-[76px] pr-3" />
      <div className="no-drag px-3 pb-3">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-white shadow-sm">
            <PrinterIcon size={14} />
          </div>
          <div className="text-[13px] font-semibold tracking-tight">Cursor for Printers</div>
        </div>
      </div>

      <nav className="no-drag flex flex-col gap-0.5 px-3">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onView(id)}
            className={cx(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
              view === id ? 'bg-accent/12 text-accent font-medium' : 'text-muted hover:bg-faint/10 hover:text-ink'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="no-drag border-t border-border p-3">
        <button
          onClick={onOpenSettings}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-left transition hover:border-faint/60"
        >
          <Zap size={14} className={provider?.available ? 'text-accent' : 'text-faint'} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-ink">{provider?.name ?? 'No engine'}</div>
            <div className="flex items-center gap-1 text-[10.5px] text-muted">
              <StatusDot tone={provider?.available ? 'ok' : 'danger'} />
              {provider ? (provider.available ? 'connected' : 'not on PATH') : 'choose one'}
            </div>
          </div>
        </button>
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted transition hover:bg-faint/10 hover:text-ink"
        >
          <Settings size={15} />
          Settings
        </button>
      </div>
    </aside>
  )
}
