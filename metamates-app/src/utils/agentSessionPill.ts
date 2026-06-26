import type { AgentConnStatus } from './agentConnectionStatus'

export type AgentSessionPillKey =
  | 'streaming'
  | 'toolRunning'
  | 'standby'
  | 'connecting'
  | 'authRequired'
  | 'error'
  | 'ready'

export function deriveAgentSessionPillKey(input: {
  connectionStatus: AgentConnStatus
  isStreaming: boolean
  hasInProgressTools: boolean
  warmupPhase?: 'idle' | 'preparing' | 'ready' | 'error'
}): AgentSessionPillKey {
  const { connectionStatus, isStreaming, hasInProgressTools, warmupPhase = 'idle' } = input

  if (isStreaming) return 'streaming'
  if (hasInProgressTools) return 'toolRunning'
  if (connectionStatus === 'connected') return 'standby'
  if (warmupPhase === 'preparing' || connectionStatus === 'connecting') return 'connecting'
  if (connectionStatus === 'auth_required') return 'authRequired'
  if (connectionStatus === 'error') return 'error'
  return 'ready'
}
