import { describe, expect, it } from 'vitest'
import {
  EMPTY_STATE_REFRESH_MS,
  buildContextFingerprint,
  buildEmptyStateSnapshot,
  buildQuestionCandidates,
  shouldRefreshEmptyStateCache,
  type EmptyStateHistoryItem,
} from '../utils/emptyStatePlanner'
import type { EmptyStateContext } from '../utils/editorEmptyState'

function ctx(overrides: Partial<EmptyStateContext> = {}): EmptyStateContext {
  return {
    hasWorkspace: true,
    isReturningUser: true,
    hour: 9,
    agentHint: 'ready',
    todayPlanExists: false,
    todayNoteExists: false,
        inboxCount: 0,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [],
    engineDisplayName: '¸±ÄÔ',
    engineNamingPromptCount: 0,
    ...overrides,
  }
}

describe('emptyStatePlanner', () => {
  it('refresh window is 10 minutes', () => {
    expect(EMPTY_STATE_REFRESH_MS).toBe(600_000)
  })

  it('fingerprint changes when inbox count changes', () => {
    const a = buildContextFingerprint(ctx({ inboxCount: 1 }), '2026-07-08')
    const b = buildContextFingerprint(ctx({ inboxCount: 2 }), '2026-07-08')
    expect(a).not.toBe(b)
  })

  it('should refresh when cache is older than window', () => {
    const fingerprint = buildContextFingerprint(ctx(), '2026-07-08')
    const cached = {
      workspacePath: 'E:/vault',
      generatedAt: Date.now() - EMPTY_STATE_REFRESH_MS - 1,
      contextFingerprint: fingerprint,
      questionId: 'welcome-back',
      questionKey: 'emptyState.questions.welcomeBack',
      questionParams: {},
      prefillKey: 'emptyState.prefill.welcomeBack',
      prefillParams: {},
      history: [],
    }
    expect(shouldRefreshEmptyStateCache(cached, fingerprint)).toBe(true)
  })

  it('morning without plan asks morning question', () => {
    const snapshot = buildEmptyStateSnapshot(ctx({ hour: 8, todayPlanExists: false }))
    expect(snapshot.questionId).toBe('morning-no-plan')
  })

  it('avoids repeating question within 24h when alternatives exist', () => {
    const history: EmptyStateHistoryItem[] = [
      { questionId: 'morning-no-plan', shownAt: Date.now() - 1000 },
    ]
    const candidates = buildQuestionCandidates(ctx({ hour: 8, inboxCount: 2 }))
    const snapshot = buildEmptyStateSnapshot(ctx({ hour: 8, inboxCount: 2 }), history)
    expect(snapshot.questionId).not.toBe('morning-no-plan')
    expect(candidates.length).toBeGreaterThan(1)
  })
})

