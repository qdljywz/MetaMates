import { test, expect } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow } from '../helpers/launchElectron'

/**
 * @suite ACP agent toolbar & chat input (optional when no local CLI)
 */
test.describe.serial('@suite Agent chat', () => {
  test('agent toolbar and chat input are usable', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app)
      const pills = page.locator('[data-testid^="agent-pill-"]')
      const count = await pills.count()
      if (count === 0) {
        test.skip(true, 'No local CLI in E2E profile — agent pills optional')
      }
      expect(count).toBeGreaterThan(0)

      const chatInput = page.locator('[data-testid="chat-input"]')
      await expect(chatInput).toBeVisible({ timeout: 30_000 })
      await chatInput.fill('E2E ping')
      await expect(page.locator('[data-testid="send-button"]')).toBeEnabled()
    } finally {
      await closeElectronApp(app)
    }
  })
})
