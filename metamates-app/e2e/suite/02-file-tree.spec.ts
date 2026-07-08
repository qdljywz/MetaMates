import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import {
  E2E_NOTE_PREFIX,
  E2E_SANDBOX_DIR_NAME,
  buildE2ENotePath,
  ensureE2ESandbox,
  getE2EWorkspace,
  removeE2EFile,
} from '../helpers/myM2Fixtures'
import { ensureFolderExpanded } from '../helpers/treeActions'
import {
  expectNoDirectoryReadError,
  normalizeAriaExpanded,
} from '../helpers/assertions'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

/**
 * @suite File tree interactions (UX-08, UX-09, EISDIR, caret stability)
 * Single Electron session — exercises expand/create without relaunching.
 */
test.describe.serial('@suite File tree', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  let createdNotePath = ''

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    ensureE2ESandbox(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (createdNotePath) removeE2EFile(createdNotePath)
    if (app) await closeElectronApp(app)
  })

  test('loads project folders under the bound workspace', async () => {
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible()
    await expect(page.locator('.ant-tree-title').filter({ hasText: PROJECTS_DIR })).toBeVisible()
    await expect(page.locator('.ant-tree-title').filter({ hasText: /01_/ })).toBeVisible()
  })

  test('clicking a folder title toggles expand without opening a tab', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const folderTitle = sandboxItem.locator('.ant-tree-title').first()
    const before = normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))
    await folderTitle.click()
    const after = normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(after).not.toBe(before)
    await expectNoDirectoryReadError(page)
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_SANDBOX_DIR_NAME })).toHaveCount(0)
  })

  test('caret toggles once and stays stable', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const switcher = sandboxItem.locator('.ant-tree-switcher').first()
    const before = normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))
    await switcher.click()
    const after = normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(after).not.toBe(before)
    await page.waitForTimeout(500)
    expect(normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))).toBe(after)
    await expectNoDirectoryReadError(page)
  })

  test('toggling one folder does not change a sibling folder', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const siblingItem = page.getByRole('treeitem', { name: /创元生科/ }).first()
    const siblingBefore = normalizeAriaExpanded(await siblingItem.getAttribute('aria-expanded'))
    await sandboxItem.locator('.ant-tree-switcher').first().click()
    await page.waitForTimeout(300)
    expect(normalizeAriaExpanded(await siblingItem.getAttribute('aria-expanded'))).toBe(siblingBefore)
  })

  test('new note in sandbox appears in tree and tab bar', async () => {
    const noteName = `${E2E_NOTE_PREFIX}${Date.now()}`
    createdNotePath = buildE2ENotePath(workspace, noteName)

    await page.keyboard.press('Escape')
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_SANDBOX_DIR_NAME }).click({ button: 'right' })

    const newNoteItem = page
      .locator('.metamates-context-menu .ant-menu-item, .ant-menu-item')
      .filter({ hasText: /新建笔记|New Note/i })
    await newNoteItem.first().click()

    const modal = page.locator('.ant-modal').filter({ hasText: /新建笔记|New Note/i })
    await modal.locator('input').fill(noteName)
    await modal.getByRole('button', { name: /创\s*建|确\s*定|Create|OK/i }).click({ timeout: 5_000 }).catch(() => modal.locator('input').press('Enter'))

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteName })).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: noteName }),
    ).toBeVisible({ timeout: 15_000 })
  })
})
