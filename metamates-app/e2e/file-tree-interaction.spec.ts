import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from './helpers/launchElectron'
import {
  E2E_SANDBOX_DIR_NAME,
  ensureE2ESandbox,
  getE2EWorkspace,
} from './helpers/myM2Fixtures'
import { ensureFolderExpanded } from './helpers/treeActions'
import { WORKSPACE_LAYOUT } from '../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

function normalizeExpanded(value: string | null): 'true' | 'false' {
  return value === 'true' ? 'true' : 'false'
}

async function expectNoDirectoryReadError(page: Page): Promise<void> {
  const errorToast = page.locator('.ant-message-error').filter({ hasText: /EISDIR|读取文件失败|read/i })
  await expect(errorToast).toHaveCount(0, { timeout: 2_000 })
}

test.describe.serial('File tree interaction (current UX issues)', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  test.beforeAll(async () => {
    ensureE2ESandbox(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('clicking a folder title toggles expand without opening a tab', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)

    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const folderTitle = sandboxItem.locator('.ant-tree-title').first()
    await expect(folderTitle).toBeVisible()

    const before = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    await folderTitle.click()
    const after = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(after).not.toBe(before)

    await expectNoDirectoryReadError(page)
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_SANDBOX_DIR_NAME })).toHaveCount(0)
  })

  test('caret click toggles once and stays stable', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)

    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const switcher = sandboxItem.locator('.ant-tree-switcher').first()
    await expect(sandboxItem).toBeVisible()

    const before = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    await switcher.click()
    const after = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(after).not.toBe(before)

    await page.waitForTimeout(500)
    const stable = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(stable).toBe(after)

    await expectNoDirectoryReadError(page)
  })

  test('expanding one folder does not flip another folder state', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)

    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const siblingItem = page.getByRole('treeitem', { name: /创元生科/ }).first()
    await expect(sandboxItem).toBeVisible()
    await expect(siblingItem).toBeVisible()

    const siblingBefore = normalizeExpanded(await siblingItem.getAttribute('aria-expanded'))
    await sandboxItem.locator('.ant-tree-switcher').first().click()
    await page.waitForTimeout(300)
    const siblingAfter = normalizeExpanded(await siblingItem.getAttribute('aria-expanded'))

    expect(siblingAfter).toBe(siblingBefore)
    await expectNoDirectoryReadError(page)
  })
})
