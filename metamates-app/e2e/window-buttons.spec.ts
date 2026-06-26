import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

test.describe.serial('窗口按钮功能测试', () => {
  let electronApp
  let page

  test.beforeAll(async () => {
    const distPath = path.join(process.cwd(), 'dist-electron', 'main.js')
    console.log('Electron main.js 路径:', distPath)
    
    electronApp = await electron.launch({
      args: [distPath],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    })
    
    electronApp.on('window', async (window) => {
      window.on('console', msg => {
        console.log('浏览器控制台:', msg.text())
      })
      window.on('pageerror', error => {
        console.log('页面错误:', error.message)
      })
    })
    
    page = await electronApp.firstWindow()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(10000)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('electronAPI 应该可用', async () => {
    const url = page.url()
    console.log('当前页面 URL:', url)
    
    const result = await page.evaluate(() => {
      return {
        electronAPI: typeof (window as any).electronAPI,
        window: typeof (window as any).electronAPI?.window,
        minimize: typeof (window as any).electronAPI?.window?.minimize,
        maximize: typeof (window as any).electronAPI?.window?.maximize,
        close: typeof (window as any).electronAPI?.window?.close
      }
    })
    console.log('electronAPI 状态:', JSON.stringify(result, null, 2))
    expect(result.electronAPI).toBe('object')
    expect(result.window).toBe('object')
    expect(result.minimize).toBe('function')
    expect(result.maximize).toBe('function')
    expect(result.close).toBe('function')
  })

  test('最小化按钮应该工作', async () => {
    const result = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      if (api && api.window && api.window.minimize) {
        return await api.window.minimize()
      }
      return { success: false, error: 'API 不可用' }
    })
    console.log('最小化结果:', JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)
  })

  test('最大化按钮应该工作', async () => {
    const result = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      if (api && api.window && api.window.maximize) {
        return await api.window.maximize()
      }
      return { success: false, error: 'API 不可用' }
    })
    console.log('最大化结果:', JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)
  })

  test('关闭按钮应该工作', async () => {
    const result = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      if (api && api.window && api.window.close) {
        return await api.window.close()
      }
      return { success: false, error: 'API 不可用' }
    })
    console.log('关闭结果:', JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)
  })
})
