/** UI connection state for an ACP backend. */
export type AgentConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_required'

/** Default permission mode — YOLO (auto-approve file/tool operations). */
export const DEFAULT_AGENT_MODE = 'yolo'

export function normalizeAgentMode(mode?: string | null): string {
  if (!mode || mode === 'default') return DEFAULT_AGENT_MODE
  return mode
}

export function isAutoApproveMode(mode?: string | null): boolean {
  const normalized = normalizeAgentMode(mode)
  return normalized === 'yolo' || normalized === 'bypassPermissions'
}

/** Raw status from main-process `get-connection-status` IPC. */
export interface BackendConnectionSnapshot {
  connected: boolean
  hasSession: boolean
  ready?: boolean
  needsAuth?: boolean
  lifecycle?: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'auth_required'
  cloudReachable?: boolean
  error?: string
  mode?: string
  modelId?: string
}

/**
 * Map main-process readiness to toolbar status.
 * Green only when lifecycle is session_active (verified prompt-ready).
 */
export function mapBackendSnapshotToStatus(
  snapshot: BackendConnectionSnapshot | null | undefined,
): AgentConnStatus {
  if (!snapshot?.connected) return 'disconnected'
  if (snapshot.lifecycle === 'session_active' || snapshot.ready) return 'connected'
  if (snapshot.needsAuth || snapshot.lifecycle === 'auth_required') return 'auth_required'
  if (snapshot.cloudReachable === false || (snapshot.lifecycle === 'error' && snapshot.error)) {
    return 'error'
  }
  if (snapshot.error && (snapshot.lifecycle === 'error' || !snapshot.hasSession)) return 'error'
  if (!snapshot.hasSession || snapshot.lifecycle === 'connecting') return 'connecting'
  if (snapshot.hasSession && !snapshot.ready) return 'connecting'
  return 'connecting'
}

export function mapLifecycleToConnStatus(lifecycle?: BackendConnectionSnapshot['lifecycle']): AgentConnStatus {
  switch (lifecycle) {
    case 'session_active':
      return 'connected'
    case 'auth_required':
      return 'auth_required'
    case 'error':
      return 'error'
    case 'connecting':
    case 'connected':
    case 'authenticated':
      return 'connecting'
    default:
      return 'disconnected'
  }
}
