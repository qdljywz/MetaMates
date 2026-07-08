import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'

/**
 * @suite Agent panel — slash command selection + voice transcript injection
 */
test.describe.serial('@suite Agent behavior', () => {
  let app: ElectronApplication
  let page: Page
  let agentAvailable = false

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)

    const pills = page.locator('[data-testid^="agent-pill-"]')
    agentAvailable = (await pills.count()) > 0
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('slash chip activates command banner', async () => {
    if (!agentAvailable) test.skip(true, 'No local CLI in E2E profile')

    const chip = page.locator('[data-testid="slash-chip-today"]')
    await expect(chip).toBeVisible({ timeout: 30_000 })
    if (await chip.isDisabled()) {
      test.skip(true, 'Agent not connected — slash chips disabled')
    }

    await chip.click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/today', { timeout: 5_000 })
  })

  test('E2E voice hook fills chat input', async () => {
    if (!agentAvailable) test.skip(true, 'No local CLI in E2E profile')

    const voiceMarker = `E2E_VOICE_${Date.now()}`
    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible()

    await page.evaluate((text) => {
      window.__METAMATES_E2E__?.simulateVoiceTranscript?.(text)
    }, voiceMarker)

    await expect(chatInput).toHaveValue(new RegExp(voiceMarker), { timeout: 5_000 })
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled()
  })
})
