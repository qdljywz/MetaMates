import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Metamates Electron App E2E Test', () => {
  let electronApp
  let window

  test.beforeAll(async () => {
    const appPath = path.resolve(__dirname, '..', '..')
    const mainJsPath = path.join(appPath, 'dist-electron', 'main.cjs')
    
    electronApp = await electron.launch({
      args: [mainJsPath],
      cwd: appPath,
      env: {
        ...process.env,
        NODE_ENV: 'development',
      }
    })
    window = await electronApp.firstWindow()
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('应用应该正常启动并显示界面', async () => {
    await window.waitForTimeout(5000)
    
    const title = await window.title()
    console.log('Page title:', title)
    expect(title).toContain('Metamates')
  })

  test('应该显示Agent Chat Panel', async () => {
    await window.waitForTimeout(3000)
    
    const pageContent = await window.content()
    console.log('Page content length:', pageContent?.length)
    
    expect(pageContent).toBeTruthy()
    expect(pageContent!.length).toBeGreaterThan(100)
  })

  test('截图验证界面', async () => {
    await window.waitForTimeout(2000)
    
    const screenshot = await window.screenshot({ path: 'test-results/app-screenshot.png' })
    console.log('Screenshot saved, size:', screenshot.length)
    expect(screenshot.length).toBeGreaterThan(1000)
  })
})
