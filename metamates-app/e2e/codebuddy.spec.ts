import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp, page

test.beforeAll(async () => {
  const projectRoot = path.join(__dirname, '..')
  electronApp = await electron.launch({
    args: [path.join(projectRoot, 'acp-poc')],
  })
  
  await electronApp.waitForEvent('window')
  await new Promise(r => setTimeout(r, 2000))
  
  const windows = electronApp.windows()
  page = windows.find(w => {
    const url = w.url()
    return url.includes('index.html') || (url.startsWith('file://') && !url.includes('devtools'))
  })
  
  if (!page) {
    for (const win of windows) {
      const title = await win.title().catch(() => '')
      if (title.includes('ACP POC') || title.includes('POC')) {
        page = win
        break
      }
    }
  }
  
  if (!page) {
    page = windows.find(w => !w.url().includes('devtools')) || windows[0]
  }
  
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  if (electronApp) {
    try {
      // Try graceful close with short timeout
      await Promise.race([
        electronApp.close(),
        new Promise(resolve => setTimeout(resolve, 5000))
      ])
    } catch (e) {
      // Ignore errors
    }
  }
})

test('Connect to CodeBuddy', async () => {
  // Select CodeBuddy
  await page.selectOption('#backend', 'codebuddy')
  
  const statusText = page.locator('#statusText')
  await expect(statusText).toHaveText('Disconnected', { timeout: 10000 })
  
  const connectBtn = page.locator('#connectBtn')
  await expect(connectBtn).toBeEnabled({ timeout: 10000 })
  
  await connectBtn.click()
  await expect(statusText).toHaveText('Connected', { timeout: 180000 })
  
  await expect(page.locator('#disconnectBtn')).toBeEnabled()
  await expect(page.locator('#newSessionBtn')).toBeEnabled()
})

test('Create session with CodeBuddy', async () => {
  await page.click('#newSessionBtn')
  await expect(page.locator('#sessionId')).toContainText('Session:', { timeout: 60000 })
  await expect(page.locator('#sendBtn')).toBeEnabled()
})

test('Send prompt to CodeBuddy', async () => {
  await page.fill('#promptInput', 'Say "hello"')
  await page.click('#sendBtn')
  await expect(page.locator('#response')).not.toContainText('Thinking...', { timeout: 300000 })
})
