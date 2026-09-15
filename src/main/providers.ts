import { run, mergedEnv } from './exec'
import type { Provider, ProviderRunResult } from '../shared/types'

/** Look up whether each provider's binary is on PATH, filling `available`/`resolvedPath`. */
export async function resolveAvailability(providers: Provider[]): Promise<Provider[]> {
  return Promise.all(
    providers.map(async (p) => {
      if (!p.bin) return { ...p, available: false }
      const res = await run('which', [p.bin], { timeoutMs: 4000 })
      const path = res.stdout.trim().split('\n')[0]
      return { ...p, available: res.ok && !!path, resolvedPath: path || undefined }
    })
  )
}

/** Invoke a provider CLI with the prompt substituted for the {PROMPT} token. */
export async function runProvider(provider: Provider, prompt: string, timeoutMs = 90000): Promise<ProviderRunResult> {
  if (!provider.bin) {
    return { ok: false, raw: '', durationMs: 0, error: 'Provider has no command configured.' }
  }
  const args = provider.args.map((a) => (a === '{PROMPT}' ? prompt : a.replace('{PROMPT}', prompt)))
  const started = Date.now()
  const res = await run(provider.bin, args, { timeoutMs, env: mergedEnv() })
  const durationMs = Date.now() - started
  if (!res.ok && !res.stdout.trim()) {
    return {
      ok: false,
      raw: res.stdout,
      stderr: res.stderr,
      durationMs,
      error: res.stderr.trim() || `"${provider.bin}" exited with code ${res.code}.`
    }
  }
  return { ok: true, raw: res.stdout, stderr: res.stderr, durationMs }
}
