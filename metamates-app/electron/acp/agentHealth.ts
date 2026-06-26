/**
 * Pre-flight agent health checks (aligned with AionUi POST /api/agents/health-check).
 * Fast probes — auth and CLI presence; does not spawn full ACP unless noted.
 */

import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'
import { isCliCommandAvailable } from '../cliDetection'
import { isGeminiAuthenticated } from '../geminiAuth'
import { getDetectionCommands, getRegistryCli } from '../shared/acpRegistry'
import { getEnhancedEnv } from '../shellEnv'

export interface AgentHealthResult {
  available: boolean
  needsAuth?: boolean
  error?: string
  latencyMs?: number
}

/** Resolve claude executable on Windows (.cmd shims need shell or absolute path). */
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
  const npmShim = path.join(
    process.env.APPDATA || '',
    'npm',
    isWindows ? 'claude.cmd' : 'claude',
  )
  if (npmShim && existsSync(npmShim)) return npmShim
  return 'claude'
}

function runJsonCli(args: string[], command?: string): Record<string, unknown> | null {
  const env = getEnhancedEnv()
  const cmd = command || resolveClaudeExecutable(env)
  const isWindows = process.platform === 'win32'
  try {
    const out = execFileSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 12000,
      windowsHide: true,
      env: env as NodeJS.ProcessEnv,
      shell: isWindows,
    })
    const trimmed = out.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      const stdout = String((error as { stdout?: Buffer | string }).stdout || '').trim()
      if (stdout.startsWith('{')) {
        try {
          return JSON.parse(stdout) as Record<string, unknown>
        } catch {
          // fall through
        }
      }
    }
    return null
  }
}

export function checkClaudeLoggedIn(): { loggedIn: boolean; error?: string } {
  const data = runJsonCli(['auth', 'status'])
  if (data && data.loggedIn === true) {
    return { loggedIn: true }
  }
  if (data && data.loggedIn === false) {
    return {
      loggedIn: false,
      error: 'Claude 未登录。请在终端运行：claude auth login',
    }
  }
  if (!isCliCommandAvailable('claude')) {
    const def = getRegistryCli('claude')
    if (def && isCliDetected('claude')) {
      return {
        loggedIn: false,
        error: 'Claude 未登录。请在终端运行：claude auth login',
      }
    }
    return { loggedIn: false, error: '未找到 Claude CLI（请安装 @anthropic-ai/claude-code）' }
  }
  return {
    loggedIn: false,
    error: 'Claude 未登录。请在终端运行：claude auth login',
  }
}

function isCliDetected(backendId: string): boolean {
  const def = getRegistryCli(backendId)
  if (!def) return false
  return getDetectionCommands(def).some((cmd) => isCliCommandAvailable(cmd))
}

/** Quick health probe — does not spawn an ACP child. */
export function checkAgentHealth(backendId: string): AgentHealthResult {
  const start = Date.now()

  if (backendId === 'gemini') {
    const authed = isGeminiAuthenticated()
    return {
      available: authed,
      needsAuth: !authed,
      error: authed ? undefined : 'Gemini 未配置 API Key 或未登录',
      latencyMs: Date.now() - start,
    }
  }

  if (backendId === 'claude') {
    const auth = checkClaudeLoggedIn()
    return {
      available: auth.loggedIn,
      needsAuth: !auth.loggedIn,
      error: auth.error,
      latencyMs: Date.now() - start,
    }
  }

  if (backendId === 'codex') {
    if (!isCliDetected('codex')) {
      return {
        available: false,
        error: 'Codex CLI 未安装或不在 PATH 中',
        latencyMs: Date.now() - start,
      }
    }
    return {
      available: true,
      latencyMs: Date.now() - start,
    }
  }

  if (!isCliDetected(backendId)) {
    const def = getRegistryCli(backendId)
    return {
      available: false,
      error: def ? `${def.name} CLI 未安装或不在 PATH 中` : `未知 Agent: ${backendId}`,
      latencyMs: Date.now() - start,
    }
  }

  return { available: true, latencyMs: Date.now() - start }
}

/** Map session failures to auth when the CLI is known to be logged out. */
export function classifySessionFailure(
  backendId: string,
  errorMessage: string,
  authRequiredFlag = false,
): { authRequired: boolean; error: string } {
  if (authRequiredFlag) {
    return { authRequired: true, error: errorMessage }
  }

  const msg = errorMessage.toLowerCase()

  if (backendId === 'claude') {
    const auth = checkClaudeLoggedIn()
    if (!auth.loggedIn) {
      return { authRequired: true, error: auth.error || errorMessage }
    }
    if (/internal error|query closed|not authenticated|unauthorized|login required/.test(msg)) {
      return {
        authRequired: true,
        error: 'Claude 会话创建失败，请确认已在终端完成 claude auth login',
      }
    }
  }

  if (backendId === 'gemini' && !isGeminiAuthenticated()) {
    return { authRequired: true, error: 'Gemini 未配置 API Key 或未登录' }
  }

  if (backendId === 'codex' && /auth|login|authentication required|unauthorized|401|403/.test(msg)) {
    return { authRequired: true, error: 'Codex 需要登录。请在终端运行 codex 并完成认证' }
  }

  if (/auth|login|api.?key|unauthorized|401|403/.test(msg)) {
    return { authRequired: true, error: errorMessage }
  }

  return { authRequired: false, error: errorMessage }
}
