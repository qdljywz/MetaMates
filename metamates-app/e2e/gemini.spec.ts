import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const projectRoot = path.join(__dirname, '..')
  
  electronApp = await electron.launch({
    args: [path.join(projectRoot, 'acp-poc')],
    env: { ...process.env, NODE_ENV: 'development' }
  })
  
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test.describe('ACP POC - Gemini CLI', () => {
  test('should show disconnected status initially', async () => {
    const statusText = page.locator('#statusText')
    await expect(statusText).toHaveText('Disconnected')
  })

  test('should have connect button enabled', async () => {
    const connectBtn = page.locator('#connectBtn')
    await expect(connectBtn).toBeVisible()
    await expect(connectBtn).toBeEnabled()
  })

  test('should connect to Gemini CLI', async () => {
    const connectBtn = page.locator('#connectBtn')
    await connectBtn.click()
    
    const statusText = page.locator('#statusText')
    await expect(statusText).toHaveText('Connected', { timeout: 120000 })
  })

  test('should enable new session button after connection', async () => {
    const newSessionBtn = page.locator('#newSessionBtn')
    await expect(newSessionBtn).toBeEnabled({ timeout: 5000 })
  })

  test('should create session', async () => {
    const newSessionBtn = page.locator('#newSessionBtn')
    await newSessionBtn.click()
    
    const sessionId = page.locator('#sessionId')
    await expect(sessionId).toContainText('Session ID:', { timeout: 30000 })
  })

  test('should send message and receive response', async () => {
    const promptInput = page.locator('#prompt')
    await promptInput.fill('Hello, say "test ok"')
    
    const sendBtn = page.locator('#sendBtn')
    await sendBtn.click()
    
    const response = page.locator('#response')
    await expect(response).not.toContainText('Waiting for response', { timeout: 120000 })
  })

  test('should disconnect properly', async () => {
    const disconnectBtn = page.locator('#disconnectBtn')
    await expect(disconnectBtn).toBeEnabled()
    await disconnectBtn.click()
    
    const statusText = page.locator('#statusText')
    await expect(statusText).toHaveText('Disconnected', { timeout: 10000 })
  })
})
