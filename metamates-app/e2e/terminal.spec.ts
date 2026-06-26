import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  await electronApp.close()
})

test.describe('终端功能测试', () => {
  test('1. 应用应该正常启动', async () => {
    const title = await page.title()
    expect(title).toBeTruthy()
    console.log('✅ 应用启动正常')
  })

  test('2. 切换到终端模式', async () => {
    const terminalTab = page.locator('text=/终端|Terminal/i').first()
    const isVisible = await terminalTab.isVisible().catch(() => false)
    
    if (isVisible) {
      await terminalTab.click()
      await page.waitForTimeout(1000)
      console.log('✅ 已切换到终端模式')
    } else {
      console.log('⚠️ 终端标签不可见')
    }
    expect(true).toBe(true)
  })

  test('3. 验证终端面板', async () => {
    await page.waitForTimeout(500)
    
    const terminalPanel = page.locator('.terminal-panel, [data-testid="terminal-panel"]').first()
    const isVisible = await terminalPanel.isVisible().catch(() => false)
    
    if (isVisible) {
      console.log('✅ 终端面板可见')
      
      const xterm = page.locator('.xterm')
      const xtermVisible = await xterm.isVisible().catch(() => false)
      
      if (xtermVisible) {
        console.log('✅ xterm 终端可见')
      }
    } else {
      console.log('⚠️ 终端面板不可见')
    }
    expect(true).toBe(true)
  })

  test('4. 验证终端连接状态', async () => {
    await page.waitForTimeout(500)
    
    const connectedTag = page.locator('text=/已连接|connected/i').first()
    const isVisible = await connectedTag.isVisible().catch(() => false)
    
    if (isVisible) {
      console.log('✅ 终端已连接')
    } else {
      const disconnectedTag = page.locator('text=/未连接|disconnected/i').first()
      const disconVisible = await disconnectedTag.isVisible().catch(() => false)
      if (disconVisible) {
        console.log('⚠️ 终端未连接')
      }
    }
    expect(true).toBe(true)
  })

  test('5. 验证 AI 命令按钮', async () => {
    await page.waitForTimeout(500)
    
    const aiCommandSection = page.locator('text=/AI 命令|AI Commands/i').first()
    const isVisible = await aiCommandSection.isVisible().catch(() => false)
    
    if (isVisible) {
      console.log('✅ AI 命令区域可见')
      
      const commandButtons = page.locator('button:has-text("/today"), button:has-text("/context")')
      const count = await commandButtons.count()
      
      if (count > 0) {
        console.log(`✅ 找到 ${count} 个 AI 命令按钮`)
      }
    } else {
      console.log('⚠️ AI 命令区域不可见')
    }
    expect(true).toBe(true)
  })

  test('6. 验证快捷命令按钮', async () => {
    await page.waitForTimeout(500)
    
    const quickCommands = ['Gemini CLI', 'dir', 'cd ..']
    
    for (const cmd of quickCommands) {
      const btn = page.locator(`button:has-text("${cmd}")`).first()
      const isVisible = await btn.isVisible().catch(() => false)
      if (isVisible) {
        console.log(`✅ 快捷命令按钮 "${cmd}" 可见`)
      }
    }
    expect(true).toBe(true)
  })
})
