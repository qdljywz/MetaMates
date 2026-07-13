import { mapBackendSnapshotToStatus, type BackendConnectionSnapshot } from './agentConnectionStatus'

import { STARTUP_SPLASH_CYCLE_MS } from './startupUx'

export const STARTUP_MIN_MS = 1_500
/** Keep splash aligned with real readiness, avoid overlong waiting. */
export const STARTUP_MAX_MS = 15_000
export const STARTUP_POLL_MS = 400
/** @deprecated Use STARTUP_SPLASH_CYCLE_MS from startupUx — kept for imports that expect this name. */
export const STARTUP_ANIMATION_CYCLE_MS = STARTUP_SPLASH_CYCLE_MS
const PRIMARY_BACKEND_PROBE_MS = 3_500
const EARLY_TIMEOUT_MS = 7_000

export type StartupGatePhase = 'workspace' | 'agent' | 'ready' | 'timeout' | 'skipped'

export type StartupGateResult = {
  reason: 'ready' | 'timeout' | 'skipped' | 'no_agent' | 'auth_required'
  elapsedMs: number
  backend?: string
  timeline: Array<{ phase: StartupGatePhase; atMs: number; detail?: string }>
}

export interface StartupGateOptions {
  minMs?: number
  maxMs?: number
  pollMs?: number
  preferredBackend?: string
  skipAgentWait?: boolean
  onPhase?: (phase: StartupGatePhase, detail?: string) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isBackendReady(snapshot: BackendConnectionSnapshot | null | undefined): boolean {
  return mapBackendSnapshotToStatus(snapshot) === 'connected'
}

function isAuthBlocked(snapshot: BackendConnectionSnapshot | null | undefined): boolean {
  return mapBackendSnapshotToStatus(snapshot) === 'auth_required'
}

function uniqueBackends(preferred: string, agents: Array<{ backend: string }>): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    ordered.push(trimmed)
  }
  push(preferred)
  for (const agent of agents) push(agent.backend)
  return ordered
}

export async function waitForStartupGate(options: StartupGateOptions = {}): Promise<StartupGateResult> {
  const {
    minMs = STARTUP_MIN_MS,
    maxMs = STARTUP_MAX_MS,
    pollMs = STARTUP_POLL_MS,
    preferredBackend,
    skipAgentWait = false,
    onPhase,
  } = options

  const started = Date.now()
  const timeline: StartupGateResult['timeline'] = []
  const mark = (phase: StartupGatePhase, detail?: string) => {
    timeline.push({ phase, atMs: Date.now() - started, detail })
    onPhase?.(phase, detail)
  }
  mark('workspace')

  if (skipAgentWait || typeof window === 'undefined' || !window.electronAPI?.acp) {
    const remain = Math.max(0, minMs - (Date.now() - started))
    if (remain > 0) await sleep(remain)
    mark('skipped')
    return { reason: 'skipped', elapsedMs: Date.now() - started, timeline }
  }

  const api = window.electronAPI.acp
  let agents: Array<{ backend: string }> = []
  let candidates: string[] = []

  try {
    agents = (await api.detectAgents?.()) ?? []
    if (agents.length === 0) {
      const remain = Math.max(0, minMs - (Date.now() - started))
      if (remain > 0) await sleep(remain)
      mark('skipped')
      return { reason: 'no_agent', elapsedMs: Date.now() - started, timeline }
    }
    candidates = uniqueBackends(preferredBackend || '', agents)
  } catch {
    candidates = preferredBackend?.trim() ? [preferredBackend.trim()] : []
  }

  let activeBackend = candidates[0] || ''
  if (activeBackend) {
    mark('agent', activeBackend)
    // Main process already warms preferred agent — avoid warmupAllAgents stampede.
    void api.selectBackend?.(activeBackend)
  } else {
    mark('agent')
  }
  let fallbackIdx = activeBackend ? Math.max(0, candidates.indexOf(activeBackend)) : 0
  let nextFallbackAt = PRIMARY_BACKEND_PROBE_MS

  let backendReadyViaEvent = false
  const unsubReady = api.onBackendReady?.((data) => {
    if (!data?.success || !data.sessionId) return
    if (!activeBackend || data.backend === activeBackend) {
      backendReadyViaEvent = true
      if (data.backend && data.backend !== activeBackend) {
        activeBackend = data.backend
      }
    }
  })

  const checkSnapshot = async (backendId: string) => {
    try {
      return await api.getConnectionStatus?.(backendId)
    } catch {
      return null
    }
  }

  try {
    while (Date.now() - started < maxMs) {
      const elapsed = Date.now() - started

      if (backendReadyViaEvent && activeBackend) {
        const snapshot = await checkSnapshot(activeBackend)
        if (isAuthBlocked(snapshot)) {
          if (elapsed >= minMs) {
            mark('ready', activeBackend)
            return { reason: 'auth_required', elapsedMs: elapsed, backend: activeBackend, timeline }
          }
        } else if (isBackendReady(snapshot)) {
          if (elapsed >= minMs) {
            mark('ready', activeBackend)
            return { reason: 'ready', elapsedMs: elapsed, backend: activeBackend, timeline }
          }
        }
      }

      for (const backendId of candidates.length > 0 ? candidates : activeBackend ? [activeBackend] : []) {
        const snapshot = await checkSnapshot(backendId)
        if (isAuthBlocked(snapshot)) {
          activeBackend = backendId
          if (elapsed >= minMs) {
            mark('ready', backendId)
            return { reason: 'auth_required', elapsedMs: elapsed, backend: backendId, timeline }
          }
        } else if (isBackendReady(snapshot)) {
          activeBackend = backendId
          if (elapsed >= minMs) {
            mark('ready', backendId)
            return { reason: 'ready', elapsedMs: elapsed, backend: backendId, timeline }
          }
        }
      }

      // Preferred backend failed to come up quickly — probe next installed backend.
      if (
        candidates.length > 1 &&
        elapsed >= nextFallbackAt &&
        fallbackIdx < candidates.length - 1
      ) {
        fallbackIdx += 1
        activeBackend = candidates[fallbackIdx]
        backendReadyViaEvent = false
        nextFallbackAt = elapsed + PRIMARY_BACKEND_PROBE_MS
        mark('agent', activeBackend)
        void api.selectBackend?.(activeBackend)
      }

      // Do not hold splash too long when all probed backends are disconnected.
      if (elapsed >= Math.max(minMs, EARLY_TIMEOUT_MS) && fallbackIdx >= candidates.length - 1) {
        break
      }

      await sleep(pollMs)
    }
  } finally {
    unsubReady?.()
  }

  mark('timeout')
  return { reason: 'timeout', elapsedMs: Date.now() - started, backend: activeBackend || undefined, timeline }
}
