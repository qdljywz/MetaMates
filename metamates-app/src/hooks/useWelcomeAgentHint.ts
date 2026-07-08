import { useEffect, useState } from 'react'
import { mapBackendSnapshotToStatus, type AgentConnStatus } from '../utils/agentConnectionStatus'
import type { WelcomeAgentHint } from '../utils/welcomeContent'

export type { WelcomeAgentHint } from '../utils/welcomeContent'

function reduceStatuses(statuses: AgentConnStatus[]): WelcomeAgentHint {
  if (statuses.length === 0) return 'no_agent'
  if (statuses.includes('auth_required')) return 'auth_required'
  if (statuses.includes('connected')) return 'ready'
  if (statuses.includes('connecting')) return 'connecting'
  if (statuses.includes('error') || statuses.includes('disconnected')) {
    return statuses.every((s) => s === 'disconnected') ? 'no_agent' : 'connecting'
  }
  return 'connecting'
}

/**
 * Poll ACP connection state for welcome-page copy (auth / ready / connecting).
 * @param workspacePath - Active workspace; idle when empty
 */
export function useWelcomeAgentHint(workspacePath?: string): WelcomeAgentHint {
  const [hint, setHint] = useState<WelcomeAgentHint>('idle')

  useEffect(() => {
    if (!workspacePath?.trim() || !window.electronAPI?.acp) {
      setHint('idle')
      return
    }

    let cancelled = false

    const refresh = async () => {
      try {
        const agents = (await window.electronAPI!.acp.detectAgents?.()) ?? []
        if (agents.length === 0) {
          if (!cancelled) setHint('no_agent')
          return
        }

        const snapshots = (await window.electronAPI!.acp.getAllConnectionStatuses?.()) ?? {}
        const statuses = agents.map((a) =>
          mapBackendSnapshotToStatus(snapshots[a.backend] ?? null),
        )
        if (!cancelled) setHint(reduceStatuses(statuses))
      } catch {
        if (!cancelled) setHint('connecting')
      }
    }

    void refresh()
    const onReady = window.electronAPI.acp.onBackendReady?.(() => {
      void refresh()
    })
    const timer = window.setInterval(refresh, 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      onReady?.()
    }
  }, [workspacePath])

  return hint
}
