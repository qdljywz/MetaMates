import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { waitForStartupGate } from '../utils/startupGate'

function mockAcp(overrides: {
  agents?: Array<{ backend: string }>
  statusByBackend?: Record<string, { connected?: boolean; authRequired?: boolean } | null>
} = {}) {
  const api = {
    detectAgents: vi.fn(async () => overrides.agents ?? [{ backend: 'codebuddy' }]),
    selectBackend: vi.fn(async () => undefined),
    getConnectionStatus: vi.fn(async (backendId: string) => {
      const snap = overrides.statusByBackend?.[backendId]
      if (snap == null) return null
      if (snap.authRequired) {
        return { connected: true, hasSession: false, needsAuth: true, lifecycle: 'auth_required' }
      }
      if (snap.connected) {
        return { connected: true, hasSession: true, ready: true, lifecycle: 'session_active' }
      }
      return { connected: false, hasSession: false }
    }),
    onBackendReady: vi.fn(() => () => {}),
  }
  Object.assign(globalThis, {
    window: { electronAPI: { acp: api } },
  })
  return api
}

describe('waitForStartupGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('skips agent wait when requested', async () => {
    mockAcp()
    const promise = waitForStartupGate({ skipAgentWait: true, minMs: 200 })
    await vi.advanceTimersByTimeAsync(250)
    const result = await promise
    expect(result.reason).toBe('skipped')
    expect(result.timeline.some((item) => item.phase === 'skipped')).toBe(true)
  })

  it('returns no_agent when nothing is installed', async () => {
    mockAcp({ agents: [] })
    const promise = waitForStartupGate({ minMs: 100 })
    await vi.advanceTimersByTimeAsync(150)
    const result = await promise
    expect(result.reason).toBe('no_agent')
  })

  it('returns ready when backend connects after minMs', async () => {
    mockAcp({
      agents: [{ backend: 'codebuddy' }],
      statusByBackend: { codebuddy: { connected: true } },
    })
    const promise = waitForStartupGate({ minMs: 500, pollMs: 100 })
    await vi.advanceTimersByTimeAsync(600)
    const result = await promise
    expect(result.reason).toBe('ready')
    expect(result.backend).toBe('codebuddy')
  })

  it('times out when backends never connect', async () => {
    mockAcp({
      agents: [{ backend: 'codebuddy' }],
      statusByBackend: { codebuddy: { connected: false } },
    })
    const promise = waitForStartupGate({ minMs: 100, maxMs: 800, pollMs: 100 })
    await vi.advanceTimersByTimeAsync(900)
    const result = await promise
    expect(result.reason).toBe('timeout')
  })
})
