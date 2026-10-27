import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import {
  closeElectronApp,
  createFreshE2EUserDataDir,
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

  test('system+light-OS keeps cream splash — no forced-dark boot', async () => {
    /**
     * Real production path (user AppData): theme=system, Windows light.
     * Old bug: main locked nativeTheme=dark → matchMedia dark → black splash → white shell.
     */
    test.setTimeout(180_000)
    const workspace = getE2EWorkspace()
    ensureE2ESandbox(workspace)
    const userDataDir = createFreshE2EUserDataDir()
    let app: ElectronApplication | undefined
    try {
      app = await launchMetaMatesApp(workspace, {
        userDataDir,
        keepUserData: true,
        theme: 'system',
        lightPalette: 'paper',
      })
      const seedPage: Page =
        app.windows()[0] || (await app.waitForEvent('window', { timeout: 60_000 }))
      await seedPage.waitForLoadState('domcontentloaded')
      await seedPage.waitForTimeout(1_500)
      await seedPage.evaluate(() => {
        const key = 'metamates-storage'
        const raw = localStorage.getItem(key)
        const data = raw
          ? (JSON.parse(raw) as { settings?: Record<string, unknown>; version?: string })
          : { settings: {}, version: '1.0.0' }
        data.settings = {
          ...(data.settings || {}),
          theme: 'system',
          lightPalette: 'paper',
          engineSetupStatus: 'ready',
        }
        localStorage.setItem(key, JSON.stringify(data))
      })
      await seedPage.waitForTimeout(800)
      await closeElectronApp(app)
      app = undefined
      await new Promise((r) => setTimeout(r, 1_000))

      app = await launchMetaMatesApp(workspace, {
        userDataDir,
        keepUserData: true,
        theme: 'system',
        lightPalette: 'paper',
      })
      const page: Page =
        app.windows()[0] || (await app.waitForEvent('window', { timeout: 60_000 }))
      await page.waitForLoadState('domcontentloaded')

      const samples: Array<{
        theme: string | null
        bodyBg: string | null
        prefersDark: boolean
        htmlSplash: boolean
        reactSplash: boolean
      }> = []
      const deadline = Date.now() + 8_000
      while (Date.now() < deadline) {
        const sample = await page.evaluate(() => ({
          theme: document.documentElement.getAttribute('data-theme'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
          htmlSplash: !!document.getElementById('boot-splash'),
          reactSplash: !!document.querySelector('[data-testid="startup-splash"]'),
        }))
        samples.push(sample)
        if (sample.theme === 'light' && (sample.htmlSplash || sample.reactSplash)) break
        await page.waitForTimeout(100)
      }

      const lightSplash = samples.find(
        (s) => s.theme === 'light' && (s.htmlSplash || s.reactSplash),
      )
      expect(
        lightSplash,
        `system+light-OS must resolve light during splash; samples=${JSON.stringify(samples.slice(0, 8))}`,
      ).toBeTruthy()
      expect(
        samples.some((s) => s.prefersDark && (s.htmlSplash || s.reactSplash)),
        'nativeTheme must not force prefers-color-scheme:dark during cream boot',
      ).toBe(false)

      if (lightSplash?.bodyBg) {
        const m = lightSplash.bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        expect(m).toBeTruthy()
        const r = Number(m![1])
        const g = Number(m![2])
        const b = Number(m![3])
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        expect(lum, `body bg too dark during splash: ${lightSplash.bodyBg}`).toBeGreaterThan(0.7)
      }

      await expect(page.locator('.status-bar')).toBeVisible({ timeout: 45_000 })
      await expect
        .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('light')
    } finally {
      if (app) await closeElectronApp(app)
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    }
  })
})
