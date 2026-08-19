import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeStartupHistoryCache,
  hasStartupHistoryCache,
  peekStartupHistoryCache,
} from './startupPreload'

describe('startup history cache', () => {
  afterEach(() => {
    delete window.__METAMATES_STARTUP_HISTORY__
  })

  it('peeks without consuming, then consume clears the cache', () => {
    window.__METAMATES_STARTUP_HISTORY__ = {
      backend: 'claude',
      messages: [{ id: '1' } as never],
      total: 1,
      hasMore: false,
    }

    expect(hasStartupHistoryCache('claude')).toBe(true)
    expect(peekStartupHistoryCache('claude')?.total).toBe(1)
    expect(window.__METAMATES_STARTUP_HISTORY__).toBeTruthy()

    const consumed = consumeStartupHistoryCache('claude')
    expect(consumed?.messages).toHaveLength(1)
    expect(window.__METAMATES_STARTUP_HISTORY__).toBeUndefined()
    expect(hasStartupHistoryCache('claude')).toBe(false)
  })

  it('does not match a different backend', () => {
    window.__METAMATES_STARTUP_HISTORY__ = {
      backend: 'claude',
      messages: [{ id: '1' } as never],
    }
    expect(hasStartupHistoryCache('codebuddy')).toBe(false)
    expect(consumeStartupHistoryCache('codebuddy')).toBeNull()
    expect(window.__METAMATES_STARTUP_HISTORY__).toBeTruthy()
  })
})
