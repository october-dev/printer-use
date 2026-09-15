import { execFile } from 'node:child_process'
import type { CommandResult } from '../shared/types'

export interface RunOpts {
  timeoutMs?: number
  /** Extra PATH entries (GUI apps on macOS often miss /usr/local/bin etc.). */
  env?: NodeJS.ProcessEnv
  input?: string
}

/**
 * Run a binary with an explicit argv array (never a shell string) so there is no
 * command-injection surface. Resolves with stdout/stderr/exit code — it never
 * rejects, so callers branch on `ok`.
 */
export function run(bin: string, args: string[], opts: RunOpts = {}): Promise<CommandResult> {
  const argv = [bin, ...args]
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        timeout: opts.timeoutMs ?? 15000,
        maxBuffer: 8 * 1024 * 1024,
        env: mergedEnv(opts.env)
      },
      (error, stdout, stderr) => {
        const code = error && typeof (error as any).code === 'number' ? (error as any).code : error ? 1 : 0
        resolve({
          ok: !error,
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          code,
          argv
        })
      }
    )
    if (opts.input != null && child.stdin) {
      child.stdin.write(opts.input)
      child.stdin.end()
    }
  })
}

/** GUI Electron apps inherit a thin PATH; make sure the usual bin dirs are present. */
export function mergedEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', `${process.env.HOME}/.local/bin`, '/usr/bin', '/usr/sbin', '/bin', '/sbin']
  const current = (process.env.PATH ?? '').split(':')
  const path = Array.from(new Set([...current, ...extraPaths])).filter(Boolean).join(':')
  return { ...process.env, ...extra, PATH: path }
}
