import fs from 'fs'
import path from 'path'
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
import { contextMenuPickOnTreeTitle } from '../helpers/contextMenu'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { expectVaultFileMissing, vaultFileExists } from '../helpers/vaultAssert'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

async function refreshFileTree(page: Page): Promise<void> {
  await page.locator('[data-testid="file-tree"]').getByRole('button', { name: /sync/i }).click()
  await page.waitForTimeout(800)
}

/**
 * @suite File rename/delete — verifies disk + tab bar stay in sync
 */
test.describe.serial('@suite File operations', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  let originalPath = ''
  let renamedPath = ''
  let noteBaseName = ''
  let renamedBaseName = ''

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    ensureE2ESandbox(workspace)
    noteBaseName = `${E2E_NOTE_PREFIX}ops-${Date.now()}`
    renamedBaseName = `${noteBaseName}-renamed`
    originalPath = buildE2ENotePath(workspace, noteBaseName)
    renamedPath = buildE2ENotePath(workspace, renamedBaseName)

    fs.writeFileSync(originalPath, '# E2E file ops\n', 'utf8')

    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    removeE2EFile(originalPath)
    removeE2EFile(renamedPath)
    if (app) await closeElectronApp(app)
  })

  test('seeded sandbox note appears in tree', async () => {
    await refreshFileTree(page)
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await expect(
      page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: noteBaseName }),
    ).toBeVisible({ timeout: 20_000 })
    expect(vaultFileExists(originalPath)).toBe(true)
  })

  test('rename updates disk path and tab label', async () => {
    await page.locator('.ant-tree-title').filter({ hasText: noteBaseName }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteBaseName })).toBeVisible({
      timeout: 10_000,
    })

    await contextMenuPickOnTreeTitle(page, noteBaseName, /重命名|Rename/i)

    const renameModal = page.locator('.ant-modal').filter({ hasText: /重命名|Rename/i }).last()
    await renameModal.locator('input').fill(renamedBaseName)
    await renameModal.locator('input').press('Enter')

    await expect(
      page.locator('[data-testid="tab-bar"] > div').filter({
        has: page.locator('span').filter({ hasText: `${renamedBaseName}.md`, exact: true }),
      }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('[data-testid="tab-bar"] > div').filter({
        has: page.locator('span').filter({ hasText: `${noteBaseName}.md`, exact: true }),
      }),
    ).toHaveCount(0)
    await expect.poll(() => vaultFileExists(renamedPath), { timeout: 15_000 }).toBe(true)
    expectVaultFileMissing(originalPath)
    expect(path.basename(renamedPath)).toBe(`${renamedBaseName}.md`)
  })

  test('delete removes file from disk and closes tab', async () => {
    await contextMenuPickOnTreeTitle(page, renamedBaseName, /^删除$|^Delete$/i)

    const deleteModal = page.locator('.ant-modal').filter({ hasText: /确认删除|Confirm delete/i }).last()
    await deleteModal.getByRole('button', { name: /删\s*除|Delete/i }).click()

    await expect(
      page.locator('[data-testid="tab-bar"] > div').filter({
        has: page.locator('span').filter({ hasText: `${renamedBaseName}.md`, exact: true }),
      }),
    ).toHaveCount(0, { timeout: 15_000 })
    await expect(
      page.locator('[data-testid="tab-bar"] > div').filter({
        has: page.locator('span').filter({ hasText: `${noteBaseName}.md`, exact: true }),
      }),
    ).toHaveCount(0, { timeout: 15_000 })
    await expect
      .poll(() => !vaultFileExists(renamedPath), { timeout: 15_000 })
      .toBe(true)
    await expect(
      page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: renamedBaseName }),
    ).toHaveCount(0, { timeout: 15_000 })
  })
})
