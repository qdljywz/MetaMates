/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('startupBoot handoff vs finish', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-boot', 'true')
    document.body.innerHTML = '<div id="boot-splash"></div><div id="root"></div>'
    vi.resetModules()
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-boot')
    document.body.innerHTML = ''
  })

  it('handoffHtmlBootSplash removes HTML overlay but keeps data-boot', async () => {
    const { handoffHtmlBootSplash } = await import('./startupBoot')
    handoffHtmlBootSplash()
    expect(document.getElementById('boot-splash')).toBeNull()
    expect(document.documentElement.getAttribute('data-boot')).toBe('true')
  })

  it('finishStartupBootPhase clears data-boot after animation frames', async () => {
    const { finishStartupBootPhase } = await import('./startupBoot')
    finishStartupBootPhase()
    await vi.waitFor(() => {
      expect(document.documentElement.hasAttribute('data-boot')).toBe(false)
    })
    expect(document.getElementById('boot-splash')).toBeNull()
  })
})
