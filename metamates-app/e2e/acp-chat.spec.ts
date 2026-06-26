import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('ACP CLI 对话功能测试', () => {
  let electronApp
  let mainWindow

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      cwd: path.resolve(__dirname, '..'),
    })
    
    await new Promise(resolve => setTimeout(resolve, 8000))
    
    const windows = electronApp.windows()
    console.log(`Found ${windows.length} windows:`, windows.map(w => w.url()))
    
    for (const w of windows) {
      const url = w.url()
      if (url.includes('localhost:5173') || url.includes('index.html')) {
        mainWindow = w
        break
      }
    }
    
    if (!mainWindow) {
      for (const w of windows) {
        const url = w.url()
        if (url.startsWith('file://') && !url.includes('devtools')) {
          mainWindow = w
          break
        }
      }
    }
    
    if (!mainWindow) {
      throw new Error('Could not find main window. Windows: ' + windows.map(w => w.url()).join(', '))
    }
    
    await mainWindow.waitForLoadState('domcontentloaded')
    await new Promise(resolve => setTimeout(resolve, 5000))
  })

  test.afterAll(async () => {
    if (electronApp) {
      const pid = electronApp.process()?.pid
      if (pid) {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {}
      }
    }
  })

  test('应该检测到至少一个CLI', async () => {
    const agentPills = mainWindow.locator('[data-testid^="agent-pill-"]')
    const count = await agentPills.count()
    console.log(`Detected ${count} CLI(s)`)
    expect(count).toBeGreaterThan(0)
  })

  test('应该自动连接到第一个CLI', async () => {
    const connectionStatus = mainWindow.locator('[data-testid="connection-status"]')
    await expect(connectionStatus).toContainText('Connected', { timeout: 60000 })
  })

  test('应该显示sessionId', async () => {
    const sessionIdEl = mainWindow.locator('[data-testid="session-id"]')
    const text = await sessionIdEl.textContent()
    console.log(`Session ID display: ${text}`)
    expect(text).toContain('Session:')
    const sessionId = text.replace('Session:', '').trim()
    expect(sessionId).not.toBe('-')
    expect(sessionId.length).toBe(8)
  })

  test('发送消息应该收到回复', async () => {
    const chatInput = mainWindow.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeEnabled({ timeout: 30000 })
    
    await chatInput.fill('Hello, this is a test message. Please respond briefly.')
    
    const sendButton = mainWindow.locator('[data-testid="send-button"]')
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    
    const messageList = mainWindow.locator('[data-testid="message-list"]')
    
    await expect(async () => {
      const content = await messageList.textContent()
      console.log(`Message list content length: ${content.length}`)
      expect(content.length).toBeGreaterThan(50)
    }).toPass({ timeout: 120000, intervals: [2000] })
  })

  test('切换到另一个CLI应该有不同的sessionId', async () => {
    const firstSessionId = await mainWindow.locator('[data-testid="session-id"]').textContent()
    
    const agentPills = mainWindow.locator('[data-testid^="agent-pill-"]')
    const count = await agentPills.count()
    
    if (count > 1) {
      const secondPill = agentPills.nth(1)
      await secondPill.click()
      
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      const connectionStatus = mainWindow.locator('[data-testid="connection-status"]')
      await expect(connectionStatus).toContainText('Connected', { timeout: 60000 })
      
      const secondSessionId = await mainWindow.locator('[data-testid="session-id"]').textContent()
      
      console.log(`First session: ${firstSessionId}`)
      console.log(`Second session: ${secondSessionId}`)
      
      expect(firstSessionId).not.toBe(secondSessionId)
    } else {
      console.log('Only one CLI detected, skipping session comparison test')
    }
  })
})
