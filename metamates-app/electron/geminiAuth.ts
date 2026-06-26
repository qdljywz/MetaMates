import { execFileSync, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readAppSettings, writeAppSettings } from './appSettings'
import { refreshPathEnv, isCliCommandAvailable } from './cliDetection'

const GEMINI_DIR = path.join(os.homedir(), '.gemini')

/** API keys must be ASCII — non-ASCII breaks fetch Authorization headers (ByteString error). */
export function isValidGeminiApiKey(key: string | null | undefined): key is string {
  if (!key) return false
  const trimmed = key.trim()
  if (trimmed.length < 20 || trimmed.length > 512) return false
  if (trimmed.includes('\uFFFD')) return false
  if (!/^[\x21-\x7E]+$/.test(trimmed)) return false
  // Windows Credential Manager stores OAuth JSON — not a usable API key header.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false
  if (/"(accessToken|refreshToken|serverName)"\s*:/.test(trimmed)) return false
  return true
}

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function readGeminiDotEnv(): Record<string, string> {
  const candidates = [
    path.join(GEMINI_DIR, '.env'),
    path.join(os.homedir(), '.env'),
  ]
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    try {
      return parseDotEnv(readFileSync(filePath, 'utf-8'))
    } catch {
      // try next
    }
  }
  return {}
}

function readGeminiSettings(): Record<string, unknown> | null {
  const settingsPath = path.join(GEMINI_DIR, 'settings.json')
  if (!existsSync(settingsPath)) return null
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function getSelectedAuthType(): string | null {
  const settings = readGeminiSettings()
  const auth = settings?.security as { auth?: { selectedType?: string } } | undefined
  const selected = auth?.auth?.selectedType
  return typeof selected === 'string' ? selected : null
}

/** Gemini CLI on Windows stores API keys in Credential Manager (not oauth_creds.json). */
function hasWindowsGeminiCliCredential(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const listing = execFileSync('cmdkey', ['/list'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    return /gemini-cli-api-key/i.test(listing) || /gemini-cli-oauth/i.test(listing)
  } catch {
    return false
  }
}

function hasLegacyOAuthFile(): boolean {
  const oauthPath = path.join(GEMINI_DIR, 'oauth_creds.json')
  if (!existsSync(oauthPath)) return false
  try {
    const creds = JSON.parse(readFileSync(oauthPath, 'utf-8')) as {
      refresh_token?: string
      access_token?: string
    }
    return Boolean(creds.refresh_token || creds.access_token)
  } catch {
    return false
  }
}

function hasGoogleAccountHint(): boolean {
  const accountsPath = path.join(GEMINI_DIR, 'google_accounts.json')
  if (!existsSync(accountsPath)) return false
  try {
    const data = JSON.parse(readFileSync(accountsPath, 'utf-8')) as {
      active?: string | null
      old?: string[]
    }
    if (data.active) return true
    return Array.isArray(data.old) && data.old.length > 0
  } catch {
    return false
  }
}

function hasEnvApiKey(): boolean {
  if (process.env.GEMINI_API_KEY?.trim()) return true
  if (process.env.GOOGLE_API_KEY?.trim()) return true
  const dotEnv = readGeminiDotEnv()
  if (dotEnv.GEMINI_API_KEY?.trim()) return true
  if (dotEnv.GOOGLE_API_KEY?.trim()) return true
  const settings = readAppSettings()
  if (typeof settings.geminiApiKey === 'string' && settings.geminiApiKey.trim()) return true
  return false
}

/**
 * Whether Gemini CLI has usable credentials on this machine.
 * Matches current Gemini CLI: API key in Credential Manager, ~/.gemini/.env, or legacy oauth file.
 */
export function isGeminiAuthenticated(): boolean {
  if (hasEnvApiKey()) return true
  if (hasWindowsGeminiCliCredential()) return true
  if (hasLegacyOAuthFile()) return true

  const authType = getSelectedAuthType()
  if (authType === 'gemini-api-key') {
    return hasEnvApiKey() || hasWindowsGeminiCliCredential()
  }
  if (
    (authType === 'oauth' || authType === 'login-with-google' || authType === 'oauth-personal') &&
    (hasGoogleAccountHint() || hasLegacyOAuthFile() || hasWindowsGeminiCliCredential())
  ) {
    return true
  }

  return false
}

/**
 * Env vars for Gemini ACP child — only explicit user-provided keys (.env / Metamates settings).
 * Do NOT inject Windows Credential Manager blobs: Gemini CLI stores OAuth JSON there and reads it
 * natively; re-injecting corrupts auth and causes fetch ByteString errors on prompt.
 */
export function getGeminiSpawnEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const dotEnv = readGeminiDotEnv()
  if (isValidGeminiApiKey(dotEnv.GEMINI_API_KEY)) env.GEMINI_API_KEY = dotEnv.GEMINI_API_KEY.trim()
  if (isValidGeminiApiKey(dotEnv.GOOGLE_API_KEY)) env.GOOGLE_API_KEY = dotEnv.GOOGLE_API_KEY.trim()

  const settings = readAppSettings()
  const storedKey = settings.geminiApiKey
  if (typeof storedKey === 'string' && isValidGeminiApiKey(storedKey)) {
    env.GEMINI_API_KEY = storedKey.trim()
  }
  return env
}

/**
 * Final env for Gemini ACP children: drop inherited corrupt keys (OAuth JSON blobs,
 * Credential Manager leakage into process.env) then apply explicit user keys only.
 */
export function applyGeminiChildEnvOverrides(base: Record<string, string>): Record<string, string> {
  const env = { ...base }
  if (!isValidGeminiApiKey(env.GEMINI_API_KEY)) delete env.GEMINI_API_KEY
  if (!isValidGeminiApiKey(env.GOOGLE_API_KEY)) delete env.GOOGLE_API_KEY
  return { ...env, ...getGeminiSpawnEnv() }
}

export function persistGeminiApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) return
  writeAppSettings({ geminiApiKey: trimmed })
}

function resolveGeminiLaunchCommand(): { command: string; args: string[] } {
  refreshPathEnv()
  const isWindows = process.platform === 'win32'
  if (isCliCommandAvailable('gemini')) {
    return { command: 'gemini', args: [] }
  }
  if (isCliCommandAvailable(isWindows ? 'npx.cmd' : 'npx')) {
    return {
      command: isWindows ? 'npx.cmd' : 'npx',
      args: ['--yes', '@google/gemini-cli'],
    }
  }
  return { command: 'gemini', args: [] }
}

/** Open a visible terminal so the user can complete Gemini OAuth (browser opens from CLI). */
export function openGeminiInteractiveLogin(): { success: boolean; error?: string } {
  refreshPathEnv()
  const { command, args } = resolveGeminiLaunchCommand()
  const geminiCmd = [command, ...args].join(' ')

  try {
    if (process.platform === 'win32') {
      const psScript = [
        'chcp 65001 > $null',
        "Write-Host 'Metamates: 首次运行 gemini 会在浏览器打开 Google 登录页。完成登录后可关闭此窗口。' -ForegroundColor Cyan",
        geminiCmd,
      ].join('; ')

      const child = spawn(
        'cmd.exe',
        ['/c', 'start', 'Gemini Login', 'powershell.exe', '-NoLogo', '-NoExit', '-Command', psScript],
        { detached: true, stdio: 'ignore', windowsHide: false, shell: false },
      )
      child.unref()
      return { success: true }
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      shell: true,
      env: { ...process.env, ...getGeminiSpawnEnv() },
    })
    child.unref()
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}
