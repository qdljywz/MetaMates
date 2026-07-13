/**
 * Pre-flight agent health checks (aligned with AionUi POST /api/agents/health-check).
 * Fast probes — auth and CLI presence; does not spawn full ACP unless noted.
 */

import { isCliCommandAvailable } from '../cliDetection'
import { getClaudeAuthHint, isClaudeAuthenticated, readClaudeSettingsEnv } from '../claudeAuth'
import { hasAnthropicCredentialInRecord } from '../shared/agentCliConfigPolicy'
import { isGeminiAuthenticated } from '../geminiAuth'
import { getDetectionCommands, getRegistryCli } from '../shared/acpRegistry'

export interface AgentHealthResult {
  available: boolean
  needsAuth?: boolean
  error?: string
  latencyMs?: number
}

export function checkClaudeLoggedIn(): { loggedIn: boolean; error?: string } {
  if (isClaudeAuthenticated()) {
    return { loggedIn: true }
  }
  return { loggedIn: false, error: getClaudeAuthHint() }
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

  if (/arrearage|account is in good standing|overdue-payment|套餐已到期|plan expired|coding plan/i.test(msg)) {
    return { authRequired: false, error: errorMessage }
  }

  if (backendId === 'claude') {
    const auth = checkClaudeLoggedIn()
    if (!auth.loggedIn) {
      return { authRequired: true, error: auth.error || errorMessage }
    }
    const settingsEnv = readClaudeSettingsEnv()
    const usesCliSettings =
      hasAnthropicCredentialInRecord(settingsEnv) || !!settingsEnv.ANTHROPIC_BASE_URL?.trim()
    if (/internal error|query closed/.test(msg)) {
      return {
        authRequired: false,
        error: usesCliSettings
          ? 'Claude 会话创建失败。请检查 ~/.claude/settings.json 中的代理与 API 配置，或点击重连再试。'
          : 'Claude 会话创建失败，请稍后重试或重新连接。',
      }
    }
    if (/not authenticated|unauthorized|login required/.test(msg)) {
      return {
        authRequired: !usesCliSettings,
        error: usesCliSettings
          ? 'Claude API 认证失败，请检查 ~/.claude/settings.json 中的 ANTHROPIC_AUTH_TOKEN 是否有效。'
          : 'Claude 会话创建失败，请确认已在终端完成 claude auth login',
      }
    }
  }

  if (backendId === 'gemini' && !isGeminiAuthenticated()) {
    return { authRequired: true, error: 'Gemini 未配置 API Key 或未登录' }
  }

  if (backendId === 'codex' && /auth|login|authentication required|unauthorized|401|403/.test(msg)) {
    return { authRequired: true, error: 'Codex 需要登录。请在终端运行 codex 并完成认证' }
  }

  if (backendId === 'codebuddy') {
    if (/disconnect|handshake|initialize failed|econnreset|spawn/i.test(msg)) {
      return {
        authRequired: false,
        error:
          'CodeBuddy ACP 连接失败。请确认 CodeBuddy 已登录，并在终端运行 codebuddy --version 检查 CLI 是否可用。',
      }
    }
    if (/auth|login|unauthorized|401|403|not authenticated/i.test(msg)) {
      return { authRequired: true, error: 'CodeBuddy 需要登录。请在 CodeBuddy 中完成账号认证后重试。' }
    }
  }

  if (/auth|login|api.?key|unauthorized|401|403/.test(msg) && !/arrearage|access denied|account is in good standing/i.test(msg)) {
    return { authRequired: true, error: errorMessage }
  }

  return { authRequired: false, error: errorMessage }
}
