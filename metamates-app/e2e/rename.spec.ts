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

test.describe('重命名功能端到端测试', () => {
  test.beforeEach(async () => {
    await page.waitForTimeout(2000)
  })

  test('应该能打开重命名模态框', async () => {
    // 检查是否有文件树节点
    const fileNode = page.locator('.ant-tree-treenode').first()
    
    // 如果没有文件节点，跳过测试
    if (!(await fileNode.isVisible())) {
      console.log('⚠️ 没有打开工作区，跳过重命名测试')
      test.skip()
      return
    }
    
    // 右键点击第一个文件节点
    await fileNode.click({ button: 'right' })
    
    // 等待右键菜单出现
    const renameMenuItem = page.locator('.ant-dropdown-menu-item:has-text("重命名")')
    await expect(renameMenuItem).toBeVisible({ timeout: 5000 })
    
    console.log('✅ 重命名菜单项可见')
  })

  test('应该能重命名文件', async () => {
    // 检查是否有文件树节点
    const fileNode = page.locator('.ant-tree-treenode').first()
    
    // 如果没有文件节点，跳过测试
    if (!(await fileNode.isVisible())) {
      console.log('⚠️ 没有打开工作区，跳过重命名测试')
      test.skip()
      return
    }
    
    // 右键点击第一个文件节点
    await fileNode.click({ button: 'right' })
    
    // 点击重命名菜单项
    const renameMenuItem = page.locator('.ant-dropdown-menu-item:has-text("重命名")')
    await renameMenuItem.click()
    
    // 等待模态框出现
    const modal = page.locator('.ant-modal:has-text("重命名")')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // 输入新名称
    const input = modal.locator('input')
    await input.fill('test-renamed-file')
    
    // 点击确定按钮
    const okButton = modal.locator('.ant-btn-primary:has-text("确定")')
    await okButton.click()
    
    // 等待成功消息
    const successMessage = page.locator('.ant-message-success')
    await expect(successMessage).toBeVisible({ timeout: 5000 })
    
    console.log('✅ 文件重命名成功')
  })
})
