import { describe, expect, it } from 'vitest'
import {
  buildEmptyStateSuggestions,
  getEmptyStateGreetingKey,
  type EmptyStateContext,
} from '../utils/editorEmptyState'
import type { WelcomeAgentHint } from '../utils/welcomeContent'

function baseCtx(overrides: Partial<EmptyStateContext> = {}): EmptyStateContext {
  return {
    hasWorkspace: true,
    isReturningUser: true,
    hour: 10,
    agentHint: 'ready' as WelcomeAgentHint,
    todayPlanExists: false,
    todayNoteExists: false,
        inboxCount: 0,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [],
    ...overrides,
  }
}

describe('editorEmptyState', () => {
  it('no workspace suggests opening workspace first', () => {
    const suggestions = buildEmptyStateSuggestions(baseCtx({ hasWorkspace: false }))
    expect(suggestions[0]?.kind).toBe('open_workspace')
    expect(suggestions[0]?.primary).toBe(true)
  })

  it('morning without plan prioritizes /today', () => {
    const suggestions = buildEmptyStateSuggestions(
      baseCtx({ hour: 9, todayPlanExists: false, agentHint: 'ready' }),
    )
    const primary = suggestions.find((s) => s.primary)
    expect(primary?.slash).toBe('today')
  })

  it('evening with note prioritizes /closeday', () => {
    const suggestions = buildEmptyStateSuggestions(
      baseCtx({ hour: 20, todayNoteExists: true, agentHint: 'ready' }),
    )
    const primary = suggestions.find((s) => s.primary)
    expect(primary?.slash).toBe('closeday')
  })

  it('inbox items suggest graduate', () => {
    const suggestions = buildEmptyStateSuggestions(baseCtx({ inboxCount: 3 }))
    expect(suggestions.some((s) => s.slash === 'graduate')).toBe(true)
  })

  it('returning user gets welcomeBack greeting in afternoon', () => {
    expect(getEmptyStateGreetingKey(baseCtx({ hour: 14, isReturningUser: true }))).toBe('afternoon')
  })

  it('first-time workspace user gets newUser greeting', () => {
    expect(getEmptyStateGreetingKey(baseCtx({ isReturningUser: false }))).toBe('newUser')
  })
})

