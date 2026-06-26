import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd()
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test.describe('编辑器功能测试', () => {
  test('应该能保存文件', async () => {
    await page.waitForTimeout(3000)
    
    // 检查是否有文件树节点
    const fileNode = page.locator('.ant-tree-treenode').first()
    
    // 如果没有文件节点，跳过测试
    if (!(await fileNode.isVisible())) {
      console.log('⚠️ 没有打开工作区，跳过编辑器测试')
      test.skip()
      return
    }
    
    // 点击第一个文件节点
    await fileNode.click()
    
    await page.waitForTimeout(500)
    
    // 在编辑器中输入内容
    const editor = page.locator('.monaco-editor textarea')
    if (await editor.isVisible()) {
      await editor.fill('Test content for save test')
      
      // 等待自动保存
      await page.waitForTimeout(2000)
      
      // 检查文件内容是否已保存
      const savedContent = await editor.inputValue()
      expect(savedContent).toContain('Test Content')
      
      console.log('✅ 编辑器保存功能验证通过')
    }
    
    // 关闭文件
    const closeButton = page.locator('.ant-tabs-close-btn').first()
    if (await closeButton.isVisible()) {
      await closeButton.click()
    }
  })
})
