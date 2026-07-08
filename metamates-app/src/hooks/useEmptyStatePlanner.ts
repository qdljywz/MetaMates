import { useCallback, useEffect, useRef, useState } from 'react'
import { loadEmptyStateContext } from '../services/loadEmptyStateContext'
import { workspaceIndexService } from '../services/workspaceIndex'
import type { EmptyStateContext } from '../utils/editorEmptyState'
import {
  applyAgentRethinkResult,
  buildEmptyStateSnapshot,
  buildLocallyRephrasedSnapshot,
  cacheEntryFromSnapshot,
  decideEmptyStateRefreshMode,
  appendHistoryShown,
  EMPTY_STATE_REFRESH_MS,
  readEmptyStateCache,
  snapshotFromCacheEntry,
  writeEmptyStateCache,
  type EmptyStateSnapshot,
} from '../utils/emptyStatePlanner'
import type { WelcomeAgentHint } from '../utils/welcomeContent'
import { useWelcomeAgentHint } from './useWelcomeAgentHint'
import { runBackgroundEmptyStateRethink } from '../services/emptyStateBackgroundRethink'

/**
 * Background planner: refreshes empty-state question every 10 min (Beijing clock)
 * and when vault signals change. Persists to localStorage for instant empty-state display.
 */
export function useEmptyStateBackgroundPlanner(workspacePath: string | undefined): void {
  const agentHint = useWelcomeAgentHint(workspacePath)
  const agentHintRef = useRef(agentHint)
  agentHintRef.current = agentHint
  const refreshInFlight = useRef(false)

  const refresh = useCallback(async (force = false) => {
    if (!workspacePath?.trim() || refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      const ctx = await loadEmptyStateContext(workspacePath, agentHintRef.current)
      const cached = await readEmptyStateCache(workspacePath)
      const refreshMode = force ? 'full_rethink' : decideEmptyStateRefreshMode(cached, ctx)
      if (refreshMode === 'none') return

      const history = cached?.history ?? []
      let snapshot = refreshMode === 'local_rephrase' && cached
        ? buildLocallyRephrasedSnapshot(ctx, cached)
        : buildEmptyStateSnapshot(ctx, history)
      if (refreshMode === 'full_rethink' && !force) {
        const rethink = await runBackgroundEmptyStateRethink(ctx)
        if (rethink?.questionText?.trim()) {
          snapshot = applyAgentRethinkResult(snapshot, rethink)
        } else if (cached) {
          // Agent failed or timed out — keep prior rethink fingerprint so we retry later.
          snapshot = {
            ...snapshot,
            significantFingerprint: cached.significantFingerprint ?? cached.contextFingerprint,
            questionText: cached.questionText,
            contextLineText: cached.contextLineText,
          }
        }
      }
      await writeEmptyStateCache(
        workspacePath,
        cacheEntryFromSnapshot(workspacePath, snapshot, history),
      )
    } finally {
      refreshInFlight.current = false
    }
  }, [workspacePath])

  useEffect(() => {
    if (!workspacePath?.trim()) return undefined
    void refresh(true)
    const timer = window.setInterval(() => void refresh(false), EMPTY_STATE_REFRESH_MS)
    const onVault = workspaceIndexService.onVaultChanged(() => void refresh(false))
    return () => {
      window.clearInterval(timer)
      onVault()
    }
  }, [workspacePath, refresh])

  useEffect(() => {
    if (!workspacePath?.trim()) return
    void refresh(false)
  }, [agentHint, workspacePath, refresh])

  useEffect(() => {
    const onForce = () => void refresh(false)
    window.addEventListener('metamates:empty-state-force-refresh', onForce)
    return () => window.removeEventListener('metamates:empty-state-force-refresh', onForce)
  }, [refresh])
}

export function useEmptyStateDisplay(
  workspacePath: string | undefined,
  agentHint: WelcomeAgentHint,
): {
  context: EmptyStateContext
  snapshot: EmptyStateSnapshot | null
  loading: boolean
  refreshNow: () => void
} {
  const [context, setContext] = useState<EmptyStateContext>({
    hasWorkspace: false,
    isReturningUser: false,
    hour: 0,
    agentHint,
    todayPlanExists: false,
    todayNoteExists: false,
    inboxCount: 0,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [],
  })
  const [snapshot, setSnapshot] = useState<EmptyStateSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const applySnapshot = useCallback(async (force = false) => {
    const ctx = await loadEmptyStateContext(workspacePath, agentHint)
    setContext(ctx)

    if (!workspacePath?.trim()) {
      const built = buildEmptyStateSnapshot(ctx, [])
      setSnapshot(built)
      setLoading(false)
      return
    }

    const cached = await readEmptyStateCache(workspacePath)
    const refreshMode = force ? 'full_rethink' : decideEmptyStateRefreshMode(cached, ctx)

    if (refreshMode === 'none' && cached) {
      setSnapshot(snapshotFromCacheEntry(cached, ctx))
      setLoading(false)
      return
    }

    const history = cached?.history ?? []
    const built = refreshMode === 'local_rephrase' && cached
      ? buildLocallyRephrasedSnapshot(ctx, cached)
      : buildEmptyStateSnapshot(ctx, history)
    await writeEmptyStateCache(workspacePath, cacheEntryFromSnapshot(workspacePath, built, history))
    setSnapshot(built)
    setLoading(false)
  }, [workspacePath, agentHint])

  useEffect(() => {
    setLoading(true)
    void applySnapshot(false)
  }, [applySnapshot])

  useEffect(() => {
    const onUpdate = () => {
      void applySnapshot(false)
    }
    window.addEventListener('metamates:empty-state-updated', onUpdate)
    return () => window.removeEventListener('metamates:empty-state-updated', onUpdate)
  }, [applySnapshot])

  const refreshNow = useCallback(() => {
    setLoading(true)
    void (async () => {
      const ctx = await loadEmptyStateContext(workspacePath, agentHint)
      setContext(ctx)
      if (!workspacePath?.trim()) {
        setSnapshot(buildEmptyStateSnapshot(ctx, []))
        setLoading(false)
        return
      }
      const cached = await readEmptyStateCache(workspacePath)
      let history = cached?.history ?? []
      if (snapshot?.questionId) {
        history = appendHistoryShown(history, snapshot.questionId)
      }
      let built = buildEmptyStateSnapshot(ctx, history)

      // Manual refresh should prefer a different question when alternatives exist.
      if (snapshot?.questionId && built.questionId === snapshot.questionId) {
        const forcedHistory = appendHistoryShown(history, snapshot.questionId, Date.now() + 1)
        const alternate = buildEmptyStateSnapshot(ctx, forcedHistory)
        if (alternate.questionId !== snapshot.questionId) {
          built = alternate
          history = forcedHistory
        }
      }

      await writeEmptyStateCache(workspacePath, cacheEntryFromSnapshot(workspacePath, built, history))
      setSnapshot(built)
      setLoading(false)
    })()
  }, [workspacePath, agentHint, snapshot?.questionId])

  return { context, snapshot, loading, refreshNow }
}
