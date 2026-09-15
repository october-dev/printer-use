import type { Provider } from './types'

/**
 * Built-in "bring your own subscription" engines. Nothing is bundled — each of
 * these shells out to a coding-agent CLI the user already has authenticated on
 * their machine. The literal token "{PROMPT}" is replaced with the full prompt.
 */
export const BUILT_IN_PROVIDERS: Provider[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'cli',
    bin: 'claude',
    // -p = headless print mode; JSON envelope so we can reliably read `.result`.
    args: ['-p', '{PROMPT}', '--output-format', 'json'],
    blurb: 'Use your Claude Code / Claude Pro subscription as the engine.',
    homepage: 'https://claude.com/claude-code'
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    kind: 'cli',
    bin: 'codex',
    // `exec` runs a single non-interactive turn.
    args: ['exec', '--skip-git-repo-check', '{PROMPT}'],
    blurb: 'Use your OpenAI Codex CLI subscription as the engine.',
    homepage: 'https://developers.openai.com/codex/cli'
  },
  {
    id: 'grok',
    name: 'Grok CLI',
    kind: 'cli',
    bin: 'grok',
    args: ['-p', '{PROMPT}'],
    blurb: 'Use your xAI Grok CLI as the engine.',
    homepage: 'https://x.ai'
  }
]

/** A blank custom provider the user can fill in during onboarding. */
export function newCustomProvider(): Provider {
  return {
    id: `custom-${Date.now()}`,
    name: 'Custom CLI',
    kind: 'cli',
    bin: '',
    args: ['{PROMPT}'],
    blurb: 'Point at any CLI that takes a prompt and prints a response.',
    custom: true
  }
}
