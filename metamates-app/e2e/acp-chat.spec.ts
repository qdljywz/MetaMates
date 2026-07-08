import { test, expect } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow } from './helpers/launchElectron'

test.describe('ACP CLI chat (Electron)', () => {
  test.describe.configure({ mode: 'serial' })

  let electronApp: Awaited<ReturnType<typeof launchMetaMatesApp>>
  let mainWindow: Awaited<ReturnType<typeof resolveMainWindow>>

  test.beforeAll(async () => {
    electronApp = await launchMetaMatesApp()
    mainWindow = await resolveMainWindow(electronApp)
  })

  test.afterAll(async () => {
    await closeElectronApp(electronApp)
  })

  test('should detect at least one CLI agent pill', async () => {
    const agentPills = mainWindow.locator('[data-testid^="agent-pill-"]')
    const count = await agentPills.count()
    console.log(`Detected ${count} CLI(s)`)
    test.skip(count === 0, 'No local CLI installed in isolated E2E profile — run test:user-journey for full agent checks')
    expect(count).toBeGreaterThan(0)
  })

  test('should show chat input for sending messages', async () => {
    const chatInput = mainWindow.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible({ timeout: 30_000 })
    await chatInput.fill('E2E ping — reply with OK')
    await expect(mainWindow.locator('[data-testid="send-button"]')).toBeEnabled()
  })
})
