import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, ExternalLink, Monitor, Sun, Moon } from 'lucide-react'
import type { AppConfig, Provider, ProviderRunResult } from '@shared/types'
import { Button, Field, Input, Modal, StatusDot, cx } from './ui'
import { useToast } from './toast'

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-faint/30')}
    >
      <span
        className={cx(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

export function SettingsModal({
  open,
  onClose,
  config,
  providers,
  onChange
}: {
  open: boolean
  onClose: () => void
  config: AppConfig
  providers: Provider[]
  onChange: () => Promise<void>
}) {
  const toast = useToast()
  const [testing, setTesting] = useState<string | null>(null)
  const [tested, setTested] = useState<Record<string, ProviderRunResult>>({})
  const [showCustom, setShowCustom] = useState(false)
  const [cName, setCName] = useState('')
  const [cBin, setCBin] = useState('')
  const [cArgs, setCArgs] = useState('-p {PROMPT}')

  useEffect(() => {
    if (open) setShowCustom(false)
  }, [open])

  const selectProvider = async (id: string) => {
    await window.api.config.save({ selectedProviderId: id })
    await onChange()
  }

  const test = async (p: Provider) => {
    setTesting(p.id)
    try {
      const res = await window.api.providers.test(p)
      setTested((prev) => ({ ...prev, [p.id]: res }))
    } finally {
      setTesting(null)
    }
  }

  const setTheme = async (theme: AppConfig['theme']) => {
    await window.api.config.save({ theme })
    await onChange()
  }

  const addCustom = async () => {
    if (!cName.trim() || !cBin.trim()) {
      toast({ tone: 'error', title: 'Name and command are required' })
      return
    }
    const args = cArgs.trim().split(/\s+/)
    if (!args.includes('{PROMPT}')) {
      toast({ tone: 'error', title: 'Arguments must include the {PROMPT} token' })
      return
    }
    const provider: Provider = {
      id: `custom-${Date.now()}`,
      name: cName.trim(),
      kind: 'cli',
      bin: cBin.trim(),
      args,
      blurb: 'Custom CLI engine',
      custom: true
    }
    await window.api.config.save({
      customProviders: [...config.customProviders, provider],
      selectedProviderId: provider.id
    })
    setCName('')
    setCBin('')
    setCArgs('-p {PROMPT}')
    setShowCustom(false)
    await onChange()
    toast({ tone: 'ok', title: `Added ${provider.name}` })
  }

  const themeOptions: { id: AppConfig['theme']; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon }
  ]

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-lg">
      {/* Engine */}
      <section>
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">AI Engine</div>
        <div className="flex flex-col gap-1.5">
          {providers.map((p) => {
            const isSel = config.selectedProviderId === p.id
            const t = tested[p.id]
            return (
              <div
                key={p.id}
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-3 transition',
                  isSel ? 'border-accent bg-accent/[0.06]' : 'border-border'
                )}
              >
                <button onClick={() => selectProvider(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span
                    className={cx(
                      'flex h-5 w-5 items-center justify-center rounded-full border',
                      isSel ? 'border-accent bg-accent text-white' : 'border-faint/50 text-transparent'
                    )}
                  >
                    <Check size={12} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      {p.name}
                      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted">
                        <StatusDot tone={p.available ? 'ok' : 'danger'} />
                        {p.available ? 'ready' : 'not on PATH'}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint">
                      {p.bin} {p.args.join(' ')}
                    </div>
                    {t && (
                      <div className={cx('text-[11px]', t.ok ? 'text-ok' : 'text-danger')}>
                        {t.ok ? `✓ ${(t.durationMs / 1000).toFixed(1)}s` : `✕ ${t.error ?? 'failed'}`}
                      </div>
                    )}
                  </div>
                </button>
                {p.available ? (
                  <Button size="sm" variant="ghost" onClick={() => test(p)}>
                    {testing === p.id ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                  </Button>
                ) : (
                  p.homepage && (
                    <Button size="sm" variant="ghost" onClick={() => window.api.system.openExternal(p.homepage!)}>
                      Get <ExternalLink size={11} />
                    </Button>
                  )
                )}
              </div>
            )
          })}
        </div>

        {showCustom ? (
          <div className="mt-2 rounded-xl border border-border bg-surface p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Name">
                <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="My CLI" />
              </Field>
              <Field label="Command">
                <Input value={cBin} onChange={(e) => setCBin(e.target.value)} placeholder="mycli" />
              </Field>
            </div>
            <div className="mt-2.5">
              <Field label="Arguments" hint="must include {PROMPT}">
                <Input value={cArgs} onChange={(e) => setCArgs(e.target.value)} className="font-mono" />
              </Field>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowCustom(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={addCustom}>
                Add engine
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowCustom(true)}>
            <Plus size={13} /> Add custom CLI
          </Button>
        )}
      </section>

      {/* Appearance */}
      <section className="mt-6">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Appearance</div>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {themeOptions.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={cx(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition',
                config.theme === id ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              )}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </section>

      {/* Printing */}
      <section className="mt-6">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Printing</div>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <div className="text-[13px] font-medium">Confirm before printing</div>
            <div className="text-[11.5px] text-muted">Show a final confirmation before a job is spooled.</div>
          </div>
          <Switch
            checked={config.confirmBeforePrint}
            onChange={async (v) => {
              await window.api.config.save({ confirmBeforePrint: v })
              await onChange()
            }}
          />
        </div>
      </section>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}
