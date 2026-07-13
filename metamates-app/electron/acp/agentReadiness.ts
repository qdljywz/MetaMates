/**
 * Per-backend readiness — maps connection + health to prompt-ready state.
 * Aligned with AionUi agent_status: session_active only when health + session agree.
 */

import type { BackendConnection } from './AcpConnection'
import { checkAgentHealth } from './agentHealth'
import { getClaudeSpawnEnv } from '../claudeAuth'
import { CLOUD_OFFLINE_ERROR, isCloudDependentBackend, isCloudReachable } from './cloudReachability'

export type AgentLifecycleStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'session_active'
  | 'error'
  | 'auth_required'

export interface AgentReadinessSnapshot {
  connected: boolean
  hasSession: boolean
  ready: boolean
  needsAuth: boolean
  lifecycle: AgentLifecycleStatus
  cloudReachable?: boolean
  error?: string
  mode?: string
  modelId?: string
}

const HEALTH_GATED_BACKENDS = new Set(['claude', 'gemini', 'codex'])

function resolveCloudProbeUrl(backend: string): string | undefined {
  if (backend !== 'claude') return undefined
  const baseUrl = getClaudeSpawnEnv().ANTHROPIC_BASE_URL?.trim()
  if (!baseUrl) return undefined
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

/** GET probes are unreliable for custom proxies; an active session already proved CLI↔API works. */
function shouldSkipCloudReadinessProbe(backend: string, hasSession: boolean): boolean {
  if (hasSession) return true
  if (backend === 'claude' && getClaudeSpawnEnv().ANTHROPIC_BASE_URL?.trim()) return true
  return false
}

export async function evaluateAgentReadiness(
  backend: string,
  conn: BackendConnection | undefined,
): Promise<AgentReadinessSnapshot> {
  if (!conn?.child) {
    return {
      connected: false,
      hasSession: false,
      ready: false,
      needsAuth: false,
      lifecycle: 'disconnected',
    }
  }

  const hasSession = !!conn.sessionId
  const base = {
    connected: true,
    hasSession,
    mode: conn.getMode(),
    modelId: conn.currentModelId,
  }

  if (!hasSession) {
    const failure = conn.getSessionFailure()
    if (failure?.authRequired) {
      return {
        ...base,
        ready: false,
        needsAuth: true,
        lifecycle: 'auth_required',
        error: failure.error,
      }
    }
    if (failure?.error) {
      return {
        ...base,
        ready: false,
        needsAuth: false,
        lifecycle: 'error',
        error: failure.error,
      }
    }
    return {
      ...base,
      ready: false,
      needsAuth: false,
      lifecycle: 'connecting',
    }
  }

  if (HEALTH_GATED_BACKENDS.has(backend)) {
    const health = checkAgentHealth(backend)
    if (!health.available) {
      return {
        ...base,
        ready: false,
        needsAuth: !!health.needsAuth,
        lifecycle: health.needsAuth ? 'auth_required' : 'error',
        error: health.error,
      }
    }
  }

  if (isCloudDependentBackend(backend) && !shouldSkipCloudReadinessProbe(backend, hasSession)) {
    const cloudReachable = await isCloudReachable(backend, resolveCloudProbeUrl(backend))
    if (!cloudReachable) {
      return {
        ...base,
        ready: false,
        needsAuth: false,
        cloudReachable: false,
        lifecycle: 'error',
        error: CLOUD_OFFLINE_ERROR,
      }
    }
  }

  return {
    ...base,
    ready: true,
    needsAuth: false,
    cloudReachable: isCloudDependentBackend(backend) ? true : undefined,
    lifecycle: 'session_active',
  }
}
