import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEffectiveTimezone,
  getTodayDateString,
  resolveUserTimezone,
} from './paths'

describe('timezone helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolveUserTimezone prefers explicit IANA value', () => {
    expect(resolveUserTimezone('America/New_York')).toBe('America/New_York')
    expect(resolveUserTimezone('invalid/zone')).toBeTruthy()
  })

  it('getEffectiveTimezone reads userTimezone from metamates-storage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ settings: { userTimezone: 'Europe/London' } }),
    )
    expect(getEffectiveTimezone()).toBe('Europe/London')
  })

  it('getTodayDateString respects timezone at a fixed instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-07T22:30:00.000Z'))
    expect(getTodayDateString('Asia/Shanghai')).toBe('2026-07-08')
    expect(getTodayDateString('America/Los_Angeles')).toBe('2026-07-07')
    vi.useRealTimers()
  })
})
