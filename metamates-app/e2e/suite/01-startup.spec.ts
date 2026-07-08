import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  expectSplashDismissedWithinBudget,
  launchMetaMatesApp,
  resolveE2EWorkspacePath,
  resolveMainWindow,
} from '../helpers/launchElectron'
import { expectNoFirstRunModals, expectSplashDismissed } from '../helpers/assertions'

/**
 * @suite Startup & shell chrome (UX-01, UX-04, UX-07, UX-12)
 * Isolated launches — splash timing must not share a warmed session.
 */
test.describe('@suite Startup', () => {
  test('splash dismisses within force-enter budget', async () => {
    const workspace = resolveE2EWorkspacePath()
    const app = await launchMetaMatesApp(workspace)
    try {
      await expectSplashDismissedWithinBudget(app)
    } finally {
      await closeElectronApp(app)
    }
  })

  test('no welcome wizard or workspace picker when vault is pre-bound', async () => {
    const workspace = resolveE2EWorkspacePath()
    const app = await launchMetaMatesApp(workspace)
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      await expectSplashDismissed(page)
      await expectNoFirstRunModals(page)
      await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 30_000 })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('status bar anchors the bottom of the window', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      const layout = await page.evaluate(() => {
        const status = document.querySelector('.status-bar') as HTMLElement | null
        const skeletons = document.querySelectorAll('.app-container .ant-skeleton')
        const appContainer = document.querySelector('.app-container') as HTMLElement | null
        const root = document.getElementById('root') as HTMLElement | null
        return {
          innerHeight: window.innerHeight,
          statusBottom: status?.getBoundingClientRect().bottom ?? 0,
          skeletonCount: skeletons.length,
          appContainerBottom: appContainer?.getBoundingClientRect().bottom ?? 0,
          rootHeight: root?.getBoundingClientRect().height ?? 0,
        }
      })
      expect(layout.skeletonCount).toBe(0)
      expect(layout.statusBottom).toBeGreaterThan(layout.innerHeight * 0.85)
      expect(Math.abs(layout.appContainerBottom - layout.innerHeight)).toBeLessThan(6)
      expect(Math.abs(layout.rootHeight - layout.innerHeight)).toBeLessThan(6)
    } finally {
      await closeElectronApp(app)
    }
  })
})
