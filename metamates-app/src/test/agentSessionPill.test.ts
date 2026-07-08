import { describe, expect, it } from 'vitest'
import { deriveAgentSessionPillKey } from '../utils/agentSessionPill'

describe('deriveAgentSessionPillKey', () => {
  it('prioritizes streaming over tool running and standby', () => {
    expect(deriveAgentSessionPillKey({
      connectionStatus: 'connected',
      isStreaming: true,
      hasInProgressTools: true,
    })).toBe('streaming')

    expect(deriveAgentSessionPillKey({
      connectionStatus: 'connected',
      isStreaming: false,
      hasInProgressTools: true,
    })).toBe('toolRunning')

    expect(deriveAgentSessionPillKey({
      connectionStatus: 'connected',
      isStreaming: false,
      hasInProgressTools: false,
    })).toBe('standby')
  })

  it('maps disconnected states', () => {
    expect(deriveAgentSessionPillKey({
      connectionStatus: 'connecting',
      isStreaming: false,
      hasInProgressTools: false,
      warmupPhase: 'preparing',
    })).toBe('connecting')

    expect(deriveAgentSessionPillKey({
      connectionStatus: 'auth_required',
      isStreaming: false,
      hasInProgressTools: false,
    })).toBe('authRequired')
  })
})
