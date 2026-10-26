import { describe, expect, it } from 'vitest'
import { shouldSkipHistoryReload } from './historyHydration'

describe('shouldSkipHistoryReload', () => {
  it('does not skip when only error bubbles exist and vault history is not hydrated', () => {
    expect(
      shouldSkipHistoryReload({ force: false, hydrated: false, cachedCount: 1 }),
    ).toBe(false)
  })

  it('skips when vault history was applied and cache is non-empty', () => {
    expect(
      shouldSkipHistoryReload({ force: false, hydrated: true, cachedCount: 50 }),
    ).toBe(true)
  })

  it('never skips when force is set', () => {
    expect(
      shouldSkipHistoryReload({ force: true, hydrated: true, cachedCount: 50 }),
    ).toBe(false)
  })
})
