import { describe, expect, it } from 'vitest'
import { getEnhancedEnv, invalidateEnhancedEnvCache, mergePaths } from './shellEnv'

describe('shellEnv', () => {
  it('mergePaths dedupes case-insensitively on win32-style segments', () => {
    const merged = mergePaths('C:\\A;C:\\B', 'c:\\a;C:\\C')
    expect(merged.toLowerCase()).toContain('c:\\a')
    expect(merged.toLowerCase()).toContain('c:\\b')
    expect(merged.toLowerCase()).toContain('c:\\c')
  })

  /**
   * Regression: getEnhancedEnv must stay sync-fast after invalidate.
   * Spawning PowerShell/login-shell on the Electron main thread freezes the UI
   * for seconds when focus re-triggers forced CLI detection (假死).
   */
  it('getEnhancedEnv after invalidate returns quickly without sync shell spawn', () => {
    invalidateEnhancedEnvCache()
    const t0 = Date.now()
    const env = getEnhancedEnv()
    const elapsed = Date.now() - t0
    expect(env.PATH).toBeTruthy()
    expect(elapsed).toBeLessThan(200)
  })
})
