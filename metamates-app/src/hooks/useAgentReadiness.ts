import { useCallback, useState } from 'react'

export type AgentHealthRow = {
  backend: string
  name: string
  available: boolean
  needsAuth?: boolean
  error?: string
  latencyMs?: number
  checking: boolean
}

/**
 * AionUi-style readiness: check current agent health, then scan alternates if needed.
 */
export function useAgentReadiness() {
  const [checking, setChecking] = useState(false)
  const [bestAgent, setBestAgent] = useState<AgentHealthRow | null>(null)
  const [alternates, setAlternates] = useState<AgentHealthRow[]>([])

  const checkBackend = useCallback(async (backend: string): Promise<AgentHealthRow> => {
    const api = window.electronAPI?.acp
    const start = Date.now()
    if (!api?.checkAgentHealth) {
      return { backend, name: backend, available: false, checking: false, error: 'API unavailable' }
    }
    const result = await api.checkAgentHealth(backend)
    return {
      backend,
      name: backend,
      available: !!result.available,
      needsAuth: result.needsAuth,
      error: result.error,
      latencyMs: result.latencyMs ?? Date.now() - start,
      checking: false,
    }
  }, [])

  const findAlternatives = useCallback(async (
    agents: Array<{ backend: string; name: string }>,
    excludeBackend: string,
  ): Promise<AgentHealthRow | null> => {
    setChecking(true)
    setBestAgent(null)
    const candidates = agents.filter((a) => a.backend !== excludeBackend)
    const rows: AgentHealthRow[] = candidates.map((a) => ({
      backend: a.backend,
      name: a.name,
      available: false,
      checking: true,
    }))
    setAlternates(rows)

    let first: AgentHealthRow | null = null
    const checked: AgentHealthRow[] = []
    for (const agent of candidates) {
      const row = await checkBackend(agent.backend)
      const named = { ...row, name: agent.name }
      checked.push(named)
      setAlternates([...checked, ...rows.slice(checked.length)])
      if (named.available && !first) {
        first = named
        setBestAgent(named)
        setChecking(false)
        setAlternates(checked)
        return named
      }
    }
    setAlternates(checked)
    setChecking(false)
    return null
  }, [checkBackend])

  const performFullCheck = useCallback(async (
    backend: string,
    agents: Array<{ backend: string; name: string }>,
  ): Promise<boolean> => {
    setChecking(true)
    const current = await checkBackend(backend)
    if (current.available) {
      setChecking(false)
      return true
    }
    await findAlternatives(agents, backend)
    return false
  }, [checkBackend, findAlternatives])

  return {
    checking,
    bestAgent,
    alternates,
    checkBackend,
    findAlternatives,
    performFullCheck,
  }
}
