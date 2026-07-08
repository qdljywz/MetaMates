import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveE2EWorkspacePath,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { expectCommandPaletteVisible, expectElectronWorkspace } from '../helpers/assertions'

/**
 * @suite Activity bar, command palette, knowledge graph
 */
test.describe('@suite Shell navigation', () => {
  test('command palette and graph view respond to user actions', async () => {
    const workspace = resolveE2EWorkspacePath()
    const app = await launchMetaMatesApp(workspace)
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      await waitForAppShell(page)
      await expectElectronWorkspace(page, workspace)

      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }),
        )
      })
      await expectCommandPaletteVisible(page)
      await page.keyboard.press('Escape')

      await page.click('[data-testid="activity-graph"]', { timeout: 8_000 })
      await expect(page.locator('.graph-modal').first()).toBeVisible({ timeout: 15_000 })
      await page.keyboard.press('Escape')
    } finally {
      await closeElectronApp(app)
    }
  })
})
