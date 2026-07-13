/**
 * Claude CLI credential detection — aligned with how Claude Code actually runs:
 * OAuth via `claude auth login`, API keys, or ~/.claude/settings.json env (incl. proxies).
 */

import { execFileSync, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { isCliCommandAvailable, refreshPathEnv } from './cliDetection'
import { getEnhancedEnv } from './shellEnv'
import { shouldSkipClaudeSessionResume } from './shared/agentCliConfigPolicy'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')

const CREDENTIAL_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const
const SPAWN_ENV_KEYS = [
  ...CREDENTIAL_KEYS,
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
] as const

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Merge env blocks from settings.json + settings.local.json (local wins). */
export function readClaudeSettingsEnv(): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const name of ['settings.json', 'settings.local.json']) {
    const doc = readJsonFile(path.join(CLAUDE_DIR, name))
    const env = doc?.env
    if (!env || typeof env !== 'object') continue
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) merged[key] = value.trim()
    }
  }
  return merged
}

export function isValidAnthropicCredential(value: string | null | undefined): value is string {
  if (!value) return false
  const trimmed = value.trim()
  return trimmed.length >= 8
}

function hasCredentialInRecord(record: Record<string, string | undefined>): boolean {
  return CREDENTIAL_KEYS.some((key) => isValidAnthropicCredential(record[key]))
}

function resolveClaudeExecutable(env: Record<string, string | undefined>): string {
  const isWindows = process.platform === 'win32'
  try {
    const whichCmd = isWindows ? 'where.exe' : 'which'
    const out = execFileSync(whichCmd, ['claude'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: env as NodeJS.ProcessEnv,
      windowsHide: true,
      shell: isWindows,
    })
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0]
    if (out && existsSync(out)) return out
  } catch {
    // fallback
  }
  const npmShim = path.join(process.env.APPDATA || '', 'npm', isWindows ? 'claude.cmd' : 'claude')
  if (npmShim && existsSync(npmShim)) return npmShim
  return 'claude'
}

function runClaudeAuthStatus(): { loggedIn: boolean } | null {
  const env = getEnhancedEnv()
  const cmd = resolveClaudeExecutable(env)
  const isWindows = process.platform === 'win32'
  try {
    const out = execFileSync(cmd, ['auth', 'status'], {
      encoding: 'utf-8',
      timeout: 12000,
      windowsHide: true,
      env: env as NodeJS.ProcessEnv,
      shell: isWindows,
    })
    const trimmed = out.trim()
    if (!trimmed) return null
    const data = JSON.parse(trimmed) as { loggedIn?: boolean }
    return { loggedIn: data.loggedIn === true }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      const stdout = String((error as { stdout?: Buffer | string }).stdout || '').trim()
      if (stdout.startsWith('{')) {
        try {
          const data = JSON.parse(stdout) as { loggedIn?: boolean }
          return { loggedIn: data.loggedIn === true }
        } catch {
          // fall through
        }
      }
    }
    return null
  }
}

/**
 * Whether Claude CLI has usable credentials on this machine.
 * Matches Claude Code: OAuth, env API keys, or ~/.claude/settings.json env.
 */
export function isClaudeAuthenticated(): boolean {
  const env = getEnhancedEnv()
  if (hasCredentialInRecord(env)) return true

  const settingsEnv = readClaudeSettingsEnv()
  if (hasCredentialInRecord(settingsEnv)) return true

  const status = runClaudeAuthStatus()
  if (status?.loggedIn) return true

  return false
}

export function getClaudeAuthHint(): string {
  if (!isCliCommandAvailable('claude')) {
    return '未找到 Claude CLI（请安装 @anthropic-ai/claude-code）'
  }
  return 'Claude 未配置凭据。请在 ~/.claude/settings.json 的 env 中设置 ANTHROPIC_API_KEY，或运行 claude auth login'
}

/** Env vars for Claude ACP children — explicit keys + settings.json env block. */
export function getClaudeSpawnEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  const base = getEnhancedEnv()
  const settingsEnv = readClaudeSettingsEnv()

  for (const key of SPAWN_ENV_KEYS) {
    const fromBase = base[key]
    if ((CREDENTIAL_KEYS as readonly string[]).includes(key)) {
      if (isValidAnthropicCredential(fromBase)) {
        out[key] = fromBase.trim()
        continue
      }
    } else if (typeof fromBase === 'string' && fromBase.trim()) {
      out[key] = fromBase.trim()
      continue
    }
    if (settingsEnv[key]) out[key] = settingsEnv[key]
  }
  return out
}

export function getClaudePreferredModelId(): string | null {
  const env = getClaudeSpawnEnv()
  const model = env.ANTHROPIC_MODEL?.trim()
  return model || null
}

/** Third-party / proxy Claude setups configure model via settings env — do not override with ACP defaults. */
export function shouldUseClaudeEnvModel(): boolean {
  return !!getClaudePreferredModelId()
}

export function applyClaudeChildEnvOverrides(base: Record<string, string>): Record<string, string> {
  return { ...base, ...getClaudeSpawnEnv() }
}

/** session/new payload for claude-agent-acp — pass env model so proxy setups match CLI. */
export function buildClaudeSessionNewPayload(
  workspacePath: string,
  mcpServers: unknown,
  resumeSessionId?: string | null,
): Record<string, unknown> {
  const settingsFileEnv = readClaudeSettingsEnv()
  const skipResume = shouldSkipClaudeSessionResume(settingsFileEnv)
  const options: Record<string, unknown> = {}
  if (resumeSessionId && !skipResume) options.resume = resumeSessionId
  // Model/auth/base URL come from spawn env (readClaudeSettingsEnv) — same as `claude` in PowerShell.
  // MetaMates must not override with ACP defaults (e.g. claude-sonnet-4-6); session/set_model uses CLI model when locked.

  const payload: Record<string, unknown> = { cwd: workspacePath, mcpServers }
  if (Object.keys(options).length > 0) {
    payload._meta = { claudeCode: { options } }
  }
  return payload
}

/** Open a visible terminal so the user can run `claude auth login` or interactive Claude. */
export function openClaudeInteractiveLogin(): { success: boolean; error?: string } {
  refreshPathEnv()
  const isWindows = process.platform === 'win32'
  const claudeCmd = isCliCommandAvailable('claude') ? 'claude auth login' : 'npx --yes @anthropic-ai/claude-code auth login'

  try {
    if (isWindows) {
      const psScript = [
        'chcp 65001 > $null',
        "Write-Host 'MetaMates: 运行 claude auth login 完成登录；若使用 API Key，请配置 ~/.claude/settings.json 的 env。' -ForegroundColor Cyan",
        claudeCmd,
      ].join('; ')

      const child = spawn(
        'cmd.exe',
        ['/c', 'start', 'Claude Login', 'powershell.exe', '-NoLogo', '-NoExit', '-Command', psScript],
        { detached: true, stdio: 'ignore', windowsHide: false, shell: false },
      )
      child.unref()
      return { success: true }
    }

    const parts = claudeCmd.split(/\s+/)
    const child = spawn(parts[0], parts.slice(1), {
      detached: true,
      stdio: 'ignore',
      shell: true,
      env: { ...process.env, ...getClaudeSpawnEnv() },
    })
    child.unref()
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}
