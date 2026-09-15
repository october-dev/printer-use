import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AppConfig } from '../shared/types'

const DEFAULT_CONFIG: AppConfig = {
  onboarded: false,
  selectedProviderId: undefined,
  customProviders: [],
  theme: 'system',
  confirmBeforePrint: true
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

let cache: AppConfig | null = null

export async function loadConfig(): Promise<AppConfig> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(configPath(), 'utf8')
    cache = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) }
  } catch {
    cache = { ...DEFAULT_CONFIG }
  }
  return cache
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  cache = { ...current, ...patch }
  await fs.mkdir(app.getPath('userData'), { recursive: true }).catch(() => {})
  await fs.writeFile(configPath(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}
