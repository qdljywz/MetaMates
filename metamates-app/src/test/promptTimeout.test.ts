import { describe, expect, it } from 'vitest'
import { computePromptTimeoutRemaining } from '../../electron/shared/promptTimeout'

describe('computePromptTimeoutRemaining', () => {
  it('returns full budget at start', () => {
    const origin = 1_000_000
    expect(computePromptTimeoutRemaining(origin, 300_000, origin)).toBe(300_000)
  })

  it('decreases with elapsed wall time', () => {
    const origin = 1_000_000
    expect(computePromptTimeoutRemaining(origin, 300_000, origin + 60_000)).toBe(240_000)
  })

  it('never goes negative', () => {
    const origin = 1_000_000
    expect(computePromptTimeoutRemaining(origin, 300_000, origin + 400_000)).toBe(0)
  })
})
