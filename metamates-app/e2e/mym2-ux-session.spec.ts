import fs from 'fs'
import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from './helpers/launchElectron'
import {
  E2E_LINK_SEED_FILE,
  E2E_NOTE_PREFIX,
  E2E_SANDBOX_DIR_NAME,
  buildE2ENotePath,
  ensureE2ELinkSeed,
  ensureE2ESandbox,
  getE2EWorkspace,
  removeE2EFile,
} from './helpers/myM2Fixtures'
import { ensureFolderExpanded } from './helpers/treeActions'
import { WORKSPACE_LAYOUT } from '../src/constants/paths'
import { STARTUP_FORCE_ENTER_MS } from '../src/utils/startupUx'
import type { ElectronApplication, Page } from '@playwright/test'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

/**
 * One Electron session against the real MyM2 vault — no repeated open/close.
 * Isolated userData under %TEMP%; vault files only touched under _MetaMates_E2E.
 */
test.describe.serial('MyM2 UX session (single launch)', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  let createdNotePath = ''

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    if (!fs.existsSync(workspace)) {
      throw new Error(`MyM2 workspace not found: ${workspace}`)
    }
    ensureE2ESandbox(workspace)
    ensureE2ELinkSeed(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (createdNotePath) removeE2EFile(createdNotePath)
    if (app) await closeElectronApp(app)
  })

  test('splash dismisses and no first-run modals', async () => {
    await expect(page.locator('[data-testid="startup-splash"]')).toBeHidden({ timeout: STARTUP_FORCE_ENTER_MS + 2_000 })

    await expect(page.locator('[data-testid="welcome-wizard"]')).toBeHidden()

    const picker = page.locator('.ant-modal-wrap').filter({ hasText: /选择工作区|Select Workspace/i })
    await expect(picker).toHaveCount(0)
  })

  test('MyM2 workspace is bound and file tree loads folders', async () => {
    const boot = await page.evaluate(() => {
      const w = window as Window & { __METAMATES_E2E__?: { workspace?: string }; electronAPI?: unknown }
      return {
        hasElectron: typeof w.electronAPI !== 'undefined',
        e2eWorkspace: w.__METAMATES_E2E__?.workspace ?? '',
      }
    })
    expect(boot.hasElectron).toBe(true)
    expect(boot.e2eWorkspace.replace(/\\/g, '/').toLowerCase()).toBe(
      workspace.replace(/\\/g, '/').toLowerCase(),
    )

    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible()
    const treeTitles = page.locator('[data-testid="file-tree"] .ant-tree-title')
    await expect(treeTitles.first()).toBeVisible({ timeout: 30_000 })
    expect(await treeTitles.count()).toBeGreaterThan(0)

    await expect(page.locator('.ant-tree-title').filter({ hasText: PROJECTS_DIR })).toBeVisible()
    await expect(page.locator('.ant-tree-title').filter({ hasText: /01_/ })).toBeVisible()
  })

  test('agent chat panel is ready', async () => {
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-testid="agent-toolbar"]')).toBeVisible({ timeout: 30_000 })
  })

  test('open sandbox seed note creates an editor tab', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('wiki link picker hides CLI skill files (UX-11)', async () => {
    await page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await page.locator('.cm-content').click()
    await page.getByRole('button', { name: '[[ ]]' }).click()
    const modal = page.locator('.ant-modal').filter({
      hasText: /选择或创建链接目标|Select or create link target/i,
    })
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await expect(modal.locator('.ant-list-item').filter({ hasText: 'challenge' })).toHaveCount(0)
    await expect(modal.locator('.ant-list-item').filter({ hasText: 'e2e-link-seed' })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden({ timeout: 5_000 })
  })

  test('new note in sandbox appears in tree and tab bar (UX-08/09/10)', async () => {
    const noteName = `${E2E_NOTE_PREFIX}${Date.now()}`
    createdNotePath = buildE2ENotePath(workspace, noteName)

    await page.keyboard.press('Escape')
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_SANDBOX_DIR_NAME }).click({ button: 'right' })
    const newNoteItem = page
      .locator('.metamates-context-menu .ant-menu-item')
      .filter({ hasText: /新建笔记|New Note/i })
    await expect(newNoteItem.first()).toBeVisible({ timeout: 5_000 })
    await newNoteItem.first().click()

    const modal = page.locator('.ant-modal').filter({ hasText: /新建笔记|New Note/i })
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await modal.locator('input').fill(noteName)
    await modal.locator('input').press('Enter')

    await expect(modal).toBeHidden({ timeout: 15_000 })
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteName })).toBeVisible({
      timeout: 15_000,
    })

    // File tree lazy nodes must show the new item immediately (UX-08).
    await expect(
      page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: noteName }),
    ).toBeVisible({ timeout: 15_000 })
  })
})
