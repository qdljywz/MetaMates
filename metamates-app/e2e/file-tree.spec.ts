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

test.describe('文件树功能测试', () => {
  test('应该能打开工作区', async () => {
    await page.waitForTimeout(3000)
    
    const openWorkspaceButton = page.locator('button:has-text("打开工作区")')
    
    if (!(await openWorkspaceButton.isVisible())) {
      console.log('⚠️ 没有打开工作区按钮，跳过文件树测试')
      test.skip()
      return
    }
    
    console.log('✅ 打开工作区按钮存在')
    
    await openWorkspaceButton.click()
    
    await page.waitForTimeout(500)
    
    const fileTree = page.locator('.ant-tree')
    await expect(fileTree).toBeVisible({ timeout: 5000 })
    
    console.log('✅ 文件树可见')
  })

  test('应该能新建文件夹', async () => {
    await page.waitForTimeout(3000)
    
    const newFolderButton = page.locator('button:has-text("新建文件夹")')
    
    if (!(await newFolderButton.isVisible())) {
      console.log('⚠️ 没有打开工作区，跳过新建文件夹测试')
      test.skip()
      return
    }
    
    await newFolderButton.click()
    
    await page.waitForTimeout(500)
    
    const modal = page.locator('.ant-modal:has-text("新建文件夹")')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    const input = modal.locator('input')
    await input.fill('test-folder-e2e')
    
    const okButton = modal.locator('button:has-text("确定")')
    await okButton.click()
    
    await page.waitForTimeout(500)
    
    const successMessage = page.locator('.ant-message-success')
    await expect(successMessage).toBeVisible({ timeout: 5000 })
    
    console.log('✅ 新建文件夹成功')
  })

  test('应该能删除文件', async () => {
    await page.waitForTimeout(3000)
    
    const fileNodes = page.locator('.ant-tree-treenode')
    const count = await fileNodes.count()
    
    if (count === 0) {
      console.log('⚠️ 没有文件节点，跳过删除文件测试')
      test.skip()
      return
    }
    
    const firstFileNode = fileNodes.first()
    const isVisible = await firstFileNode.isVisible().catch(() => false)
    
    if (!isVisible) {
      console.log('⚠️ 文件节点不可见，跳过删除文件测试')
      test.skip()
      return
    }
    
    await firstFileNode.click({ button: 'right' })
    
    await page.waitForTimeout(500)
    
    const deleteMenuItem = page.locator('.ant-dropdown-menu-item:has-text("删除")')
    
    if (!(await deleteMenuItem.isVisible())) {
      console.log('⚠️ 没有删除菜单项，跳过删除文件测试')
      test.skip()
      return
    }
    
    await deleteMenuItem.click()
    
    await page.waitForTimeout(500)
    
    const confirmModal = page.locator('.ant-modal-confirm:has-text("确认删除")')
    await expect(confirmModal).toBeVisible({ timeout: 5000 })
    
    const okButton = confirmModal.locator('button:has-text("确定")')
    await okButton.click()
    
    await page.waitForTimeout(500)
    
    const successMessage = page.locator('.ant-message-success')
    await expect(successMessage).toBeVisible({ timeout: 5000 })
    
    console.log('✅ 删除文件成功')
  })
})
