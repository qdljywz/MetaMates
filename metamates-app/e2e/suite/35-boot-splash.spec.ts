import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
} from '../helpers/launchElectron'
import { ensureE2ESandbox, getE2EWorkspace } from '../helpers/myM2Fixtures'

/**
 * Cold-start: catch splash WHILE it is visible.
 * resolveMainWindow/waitForAppShell wait for splash dismiss + status-bar — too late for logo.
 *
 * Regression: HTML #boot-splash must hand off to React StartupSplash (logo.png) and must not
 * cover the full 5.5s force-enter window.
 */
test.describe('@suite Boot splash', () => {
  test('HTML boot hands off to React splash with logo.png before shell', async () => {
    test.setTimeout(180_000)
    const workspace = getE2EWorkspace()
    ensureE2ESandbox(workspace)
    let app: ElectronApplication | undefined
    try {
      app = await launchMetaMatesApp(workspace)

      const page: Page =
        app.windows()[0] ||
        (await app.waitForEvent('window', { timeout: 60_000 }))
      await page.waitForLoadState('domcontentloaded')

      const htmlHasBoot = await page.evaluate(async () => {
        try {
          const res = await fetch(window.location.href.split('#')[0], { cache: 'no-store' })
          const text = await res.text()
          return text.includes('id="boot-splash"') && text.includes('data-boot')
        } catch {
          return false
        }
      })
      expect(htmlHasBoot).toBe(true)

      // Wait until React splash is the visible surface (HTML overlay removed).
      await expect
        .poll(
          async () => {
            const bootGone = (await page.locator('#boot-splash').count()) === 0
            const splashVisible = await page
              .locator('[data-testid="startup-splash"]')
              .isVisible()
              .catch(() => false)
            const shellVisible = await page.locator('.status-bar').isVisible().catch(() => false)
            if (splashVisible && bootGone) return 'react-splash'
            if (shellVisible) return 'shell'
            if ((await page.locator('#boot-splash').count()) > 0) return 'html-boot'
            return 'pending'
          },
          { timeout: 60_000 },
        )
        .toMatch(/react-splash|shell/)

      const splashVisible = await page
        .locator('[data-testid="startup-splash"]')
        .isVisible()
        .catch(() => false)

      if (!splashVisible) {
        // Attached too late — splash already dismissed. Still require shell (not blank).
        await expect(page.locator('.status-bar')).toBeVisible({ timeout: 30_000 })
        test.info().annotations.push({
          type: 'note',
          description: 'Splash finished before attach; asserted HTML boot markup + shell only',
        })
        return
      }

      await expect(page.locator('#boot-splash')).toHaveCount(0)

      const logo = page.locator('[data-testid="startup-splash"] .startup-splash__logo-img')
      await expect(logo).toBeAttached({ timeout: 5_000 })
      await expect
        .poll(async () => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0)
    } finally {
      if (app) await closeElectronApp(app)
    }
  })
})
