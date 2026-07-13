import { describe, expect, it } from 'vitest'
import {
  ENGINE_DEFAULT_PARTNER_NAME,
  ENGINE_NAMING_SKIP_COOLDOWN_MS,
  hasCustomEngineDisplayName,
  normalizeEngineDisplayName,
  resolvePartnerDisplayName,
  shouldPromptEngineNaming,
  validateCustomEngineDisplayName,
  validateEngineDisplayName,
} from './engineDisplayName'
import { buildEmptyStateSnapshot, buildQuestionCandidates } from './emptyStatePlanner'
import type { EmptyStateContext } from './editorEmptyState'

function baseContext(partial: Partial<EmptyStateContext> = {}): EmptyStateContext {
  return {
    hasWorkspace: true,
    isReturningUser: false,
    hour: 10,
    agentHint: 'ready',
    todayPlanExists: false,
    todayNoteExists: false,
    inboxCount: 0,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [],
    engineNamingPromptCount: 0,
    ...partial,
  }
}

describe('engineDisplayName', () => {
  it('normalizes whitespace', () => {
    expect(normalizeEngineDisplayName('  副脑  ')).toBe('副脑')
  })

  it('rejects empty and overlong names', () => {
    expect(validateEngineDisplayName('')).toEqual({ ok: false, reason: 'empty' })
    expect(validateEngineDisplayName('a'.repeat(13))).toEqual({ ok: false, reason: 'tooLong' })
  })

  it('accepts short CJK names', () => {
    expect(validateEngineDisplayName('智囊')).toEqual({ ok: true, name: '智囊' })
  })

  it('resolves empty or 2M to default partner name', () => {
    expect(resolvePartnerDisplayName()).toBe(ENGINE_DEFAULT_PARTNER_NAME)
    expect(resolvePartnerDisplayName('2M')).toBe(ENGINE_DEFAULT_PARTNER_NAME)
    expect(resolvePartnerDisplayName('小豆豆')).toBe('小豆豆')
  })

  it('treats 2M as not custom', () => {
    expect(hasCustomEngineDisplayName({ engineDisplayName: '2M' })).toBe(false)
    expect(hasCustomEngineDisplayName({ engineDisplayName: '副脑' })).toBe(true)
  })

  it('rejects 2M as a custom rename', () => {
    expect(validateCustomEngineDisplayName('2M')).toEqual({ ok: false, reason: 'default' })
  })

  it('still prompts when only default 2M is set', () => {
    const result = shouldPromptEngineNaming(
      { hasWorkspace: true, agentHint: 'ready', engineDisplayName: '2M' },
      [],
    )
    expect(result).toEqual({ show: true, firstTime: true })
  })

  it('prompts on first visit when unnamed', () => {
    const result = shouldPromptEngineNaming(
      { hasWorkspace: true, agentHint: 'ready' },
      [],
    )
    expect(result).toEqual({ show: true, firstTime: true })
  })

  it('does not prompt within skip cooldown', () => {
    const now = Date.now()
    const result = shouldPromptEngineNaming(
      {
        hasWorkspace: true,
        agentHint: 'ready',
        engineNamingSkippedAt: now - 1_000,
      },
      [{ questionId: 'name-engine', shownAt: now - 2_000 }],
      now,
    )
    expect(result.show).toBe(false)
  })

  it('may remind after cooldown and enough other turns', () => {
    const now = Date.now()
    const result = shouldPromptEngineNaming(
      {
        hasWorkspace: true,
        agentHint: 'ready',
        engineNamingSkippedAt: now - ENGINE_NAMING_SKIP_COOLDOWN_MS - 1,
        engineNamingPromptCount: 1,
      },
      [
        { questionId: 'name-engine', shownAt: now - ENGINE_NAMING_SKIP_COOLDOWN_MS - 2_000 },
        { questionId: 'welcome-back', shownAt: now - 5_000 },
        { questionId: 'morning-no-plan', shownAt: now - 4_000 },
        { questionId: 'new-user', shownAt: now - 3_000 },
      ],
      now,
    )
    expect(result).toEqual({ show: true, firstTime: false })
  })
})

describe('emptyState engine naming question', () => {
  it('prioritizes first-time naming over new-user', () => {
    const ctx = baseContext({ isReturningUser: false })
    const candidates = buildQuestionCandidates(ctx, [])
    const picked = buildEmptyStateSnapshot(ctx, []).questionId
    expect(candidates.some((item) => item.id === 'name-engine')).toBe(true)
    expect(picked).toBe('name-engine')
  })

  it('hides naming when a custom name exists', () => {
    const ctx = baseContext({ engineDisplayName: '副脑' })
    const candidates = buildQuestionCandidates(ctx, [])
    expect(candidates.some((item) => item.id === 'name-engine')).toBe(false)
  })

  it('never picks name-engine after user has named', () => {
    const ctx = baseContext({
      engineDisplayName: '智囊',
      isReturningUser: false,
    })
    const snapshot = buildEmptyStateSnapshot(ctx, [])
    expect(snapshot.questionId).not.toBe('name-engine')
  })
})
