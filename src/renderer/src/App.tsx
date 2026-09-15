import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, Provider } from '@shared/types'
import { ToastProvider } from './components/toast'
import { Sidebar, type View } from './components/Sidebar'
import { Onboarding } from './components/Onboarding'
import { CommandView } from './components/CommandView'
import { PrintersView } from './components/PrintersView'
import { QueueView } from './components/QueueView'
import { SettingsModal } from './components/Settings'
import { Spinner } from './components/ui'

function useTheme(theme: AppConfig['theme'] | undefined) {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark =
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', !!dark)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [view, setView] = useState<View>(
    (new URLSearchParams(window.location.search).get('view') as View) || 'print'
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  useTheme(config?.theme)

  const refreshConfig = useCallback(async () => {
    const [cfg, provs] = await Promise.all([window.api.config.get(), window.api.providers.list()])
    setConfig(cfg)
    setProviders(provs)
  }, [])

  useEffect(() => {
    refreshConfig()
  }, [refreshConfig])

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner className="text-accent" />
      </div>
    )
  }

  if (!config.onboarded) {
    return (
      <ToastProvider>
        <Onboarding
          providers={providers}
          onComplete={async (providerId) => {
            await window.api.config.save({ onboarded: true, selectedProviderId: providerId })
            await refreshConfig()
          }}
        />
      </ToastProvider>
    )
  }

  const activeProvider = providers.find((p) => p.id === config.selectedProviderId) ?? null

  return (
    <ToastProvider>
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar
          view={view}
          onView={setView}
          provider={activeProvider}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="drag h-11 w-full shrink-0" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === 'print' && <CommandView provider={activeProvider} onNeedProvider={() => setSettingsOpen(true)} />}
            {view === 'printers' && <PrintersView />}
            {view === 'queue' && <QueueView />}
          </div>
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        providers={providers}
        onChange={refreshConfig}
      />
    </ToastProvider>
  )
}
