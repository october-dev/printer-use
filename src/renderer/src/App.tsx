import { useEffect, useState } from 'react'
import type { AppConfig } from '@shared/types'
import { ToastProvider } from './components/toast'
import { StudioProvider, useStudio } from './studio'
import { Onboarding } from './components/Onboarding'
import { Stage } from './components/Stage'
import { ChatDock } from './components/ChatDock'
import { SettingsModal } from './components/Settings'
import { ConnectModal } from './components/ConnectModal'
import { DiagnosticsModal } from './components/DiagnosticsModal'
import { QueueModal } from './components/QueueModal'
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

function AppInner() {
  const { config, providers, refreshConfig, selectedPrinter } = useStudio()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [diagnoseOpen, setDiagnoseOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)

  useTheme(config?.theme)

  // Dev-only: open a modal from ?modal=connect|diagnose|queue for screenshots.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('modal')
    if (m === 'connect') setConnectOpen(true)
    else if (m === 'diagnose') setDiagnoseOpen(true)
    else if (m === 'queue') setQueueOpen(true)
  }, [])

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner className="text-accent" />
      </div>
    )
  }

  if (!config.onboarded) {
    return (
      <Onboarding
        providers={providers}
        onComplete={async (providerId) => {
          await window.api.config.save({ onboarded: true, selectedProviderId: providerId })
          await refreshConfig()
        }}
      />
    )
  }

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        <Stage
          onOpenQueue={() => setQueueOpen(true)}
          onOpenAddPrinter={() => setConnectOpen(true)}
          onOpenDiagnostics={() => setDiagnoseOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <ChatDock onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        providers={providers}
        onChange={refreshConfig}
      />
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      <DiagnosticsModal open={diagnoseOpen} onClose={() => setDiagnoseOpen(false)} name={selectedPrinter} />
      <QueueModal open={queueOpen} onClose={() => setQueueOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <StudioProvider>
        <AppInner />
      </StudioProvider>
    </ToastProvider>
  )
}
