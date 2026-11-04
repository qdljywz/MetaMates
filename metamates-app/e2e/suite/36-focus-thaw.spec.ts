import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
} from '../helpers/launchElectron'
import { expectSplashDismissed } from '../helpers/assertions'

/**
 * @suite Focus thaw / 假死
 * Failure mode: long background → Alt-Tab back → multi-second unresponsive UI.
 * Cause we fixed: window focus ran acp.refreshAgents (force CLI detect + sync PATH).
 * This spec asserts focus does NOT call refreshAgents, and DOM stays responsive after restore.
 */
test.describe('@suite Focus thaw', () => {
  test('window focus after background does not force-refresh agents; DOM responds', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      await expectSplashDismissed(page)
      await expect(page.locator('.status-bar')).toBeVisible({ timeout: 30_000 })

      await page.evaluate(() => {
        const w = window as unknown as {
          electronAPI?: { acp?: { refreshAgents?: () => Promise<unknown> } }
          __mmRefreshAgentsCalls?: number
        }
        w.__mmRefreshAgentsCalls = 0
        const acp = w.electronAPI?.acp
        if (!acp?.refreshAgents) return
        const original = acp.refreshAgents.bind(acp)
        acp.refreshAgents = async (...args: unknown[]) => {
          w.__mmRefreshAgentsCalls = (w.__mmRefreshAgentsCalls || 0) + 1
          return original(...(args as []))
        }
      })

      await app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0]
        if (w && !w.isDestroyed()) w.minimize()
      })
      await page.waitForTimeout(2_500)
      await app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0]
        if (!w || w.isDestroyed()) return
        w.restore()
        w.show()
        w.focus()
      })

      // Focus handler defers ~800ms; wait past that then assert no force refresh.
      await page.waitForTimeout(1_200)

      const probeStart = Date.now()
      const probe = await page.evaluate(() => {
        const w = window as unknown as { __mmRefreshAgentsCalls?: number }
        return {
          refreshCalls: w.__mmRefreshAgentsCalls ?? -1,
          shell: !!document.querySelector('.status-bar'),
          theme: document.documentElement.getAttribute('data-theme'),
        }
      })
      const probeMs = Date.now() - probeStart

      expect(probe.refreshCalls, 'focus must not call acp.refreshAgents').toBe(0)
      expect(probe.shell).toBe(true)
      expect(probeMs, 'DOM evaluate after restore should stay snappy').toBeLessThan(1500)
    } finally {
      await closeElectronApp(app)
    }
  })
})
