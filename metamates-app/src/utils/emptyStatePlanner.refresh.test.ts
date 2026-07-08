import { describe, expect, it } from 'vitest'
import {
  buildEmptyStateSnapshot,
  buildLocallyRephrasedSnapshot,
  buildQuestionCandidates,
  cacheEntryFromSnapshot,
  decideEmptyStateRefreshMode,
} from './emptyStatePlanner'
import type { EmptyStateContext } from './editorEmptyState'

/**
 * Build a stable empty-state context for refresh strategy tests.
 */
function makeContext(partial: Partial<EmptyStateContext> = {}): EmptyStateContext {
  return {
    hasWorkspace: true,
    isReturningUser: true,
    hour: 15,
    agentHint: 'ready',
    todayPlanExists: false,
    todayNoteExists: false,
    inboxCount: 8,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [{ path: 'E:/MyM2/01_日记与计划/2026-07-07.md', name: '2026-07-07.md' }],
    ...partial,
  }
}

describe('emptyState refresh strategy', () => {
  it('uses local rephrase when only minor inbox count changes', () => {
    const base = makeContext({ inboxCount: 8 })
    const snapshot = buildEmptyStateSnapshot(base, [], { beijingDate: '2026-07-07', now: 1_000 })
    const cached = cacheEntryFromSnapshot('E:/MyM2', snapshot, [])

    const mode = decideEmptyStateRefreshMode(cached, makeContext({ inboxCount: 7 }), {
      beijingDate: '2026-07-07',
      now: 2_000,
    })

    expect(mode).toBe('local_rephrase')
  })

  it('uses full rethink when situation meaningfully changes', () => {
    const base = makeContext({ todayPlanExists: false, hour: 15 })
    const snapshot = buildEmptyStateSnapshot(base, [], { beijingDate: '2026-07-07', now: 1_000 })
    const cached = cacheEntryFromSnapshot('E:/MyM2', snapshot, [])

    const mode = decideEmptyStateRefreshMode(cached, makeContext({ todayPlanExists: true, hour: 15 }), {
      beijingDate: '2026-07-07',
      now: 2_000,
    })

    expect(mode).toBe('full_rethink')
  })

  it('uses local rephrase after refresh window even with same context', () => {
    const base = makeContext()
    const snapshot = buildEmptyStateSnapshot(base, [], { beijingDate: '2026-07-07', now: 1_000 })
    const cached = cacheEntryFromSnapshot('E:/MyM2', snapshot, [])

    const mode = decideEmptyStateRefreshMode(cached, base, {
      beijingDate: '2026-07-07',
      now: 1_000 + 10 * 60 * 1000 + 1,
    })

    expect(mode).toBe('local_rephrase')
  })

  it('rotates to another phrasing on local rephrase', () => {
    const base = makeContext({ inboxCount: 8 })
    const snapshot = buildEmptyStateSnapshot(base, [], {
      beijingDate: '2026-07-07',
      now: 1_000,
      questionVariant: 0,
    })
    const cached = cacheEntryFromSnapshot('E:/MyM2', snapshot, [])

    const next = buildLocallyRephrasedSnapshot(base, cached, {
      beijingDate: '2026-07-07',
      now: 2_000,
    })

    expect(next.questionId).toBe(snapshot.questionId)
    expect(next.questionVariant).not.toBe(snapshot.questionVariant)
    expect(next.questionKey).not.toBe(snapshot.questionKey)
  })

  it('prefers plan-open-tasks over large inbox backlog', () => {
    const ctx = makeContext({
      inboxCount: 25,
      todayPlanExists: true,
      planUncheckedCount: 3,
      planFirstOpenTask: '对齐产品化路线',
      hour: 16,
    })
    const candidates = buildQuestionCandidates(ctx)
    const picked = candidates.sort((a, b) => b.priority - a.priority)[0]
    expect(picked?.id).toBe('plan-open-tasks')
  })
})
