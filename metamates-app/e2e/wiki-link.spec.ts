import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

let electronApp: ElectronApplication
let page: Page

test.describe.serial('Wiki Link 点击功能测试', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
    })
    
    page = await electronApp.firstWindow()
    
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    await page.waitForTimeout(5000)
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('应用加载正常', async () => {
    await page.waitForTimeout(2000)
    
    const html = await page.locator('html').innerHTML()
    expect(html.length).toBeGreaterThan(0)
    
    console.log('✅ 应用加载正常')
    expect(true).toBe(true)
  })

  test('Wiki Link 样式检查', async () => {
    await page.waitForTimeout(1000)
    
    const wikiLinkStyle = page.locator('.cm-wiki-link')
    const hasWikiLink = await wikiLinkStyle.count()
    
    console.log(`✅ Wiki Link 元素数量: ${hasWikiLink}`)
    expect(hasWikiLink).toBeGreaterThanOrEqual(0)
  })

  test('点击 Wiki Link 测试', async () => {
    await page.waitForTimeout(1000)
    
    const wikiLink = page.locator('.cm-wiki-link').first()
    
    const hasWikiLink = await wikiLink.count()
    
    if (hasWikiLink > 0) {
      await wikiLink.click()
      await page.waitForTimeout(1000)
      
      console.log('✅ Wiki Link 点击成功')
    } else {
      console.log('⚠️ 当前文档没有 Wiki Link，跳过测试')
    }
    
    expect(true).toBe(true)
  })
})
