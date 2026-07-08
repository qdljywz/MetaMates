import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import {
  E2E_LINK_SEED_FILE,
  E2E_SANDBOX_DIR_NAME,
  ensureE2ELinkSeed,
  getE2EWorkspace,
} from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { expectVaultFileContains, readVaultFileUtf8 } from '../helpers/vaultAssert'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

/**
 * @suite Editor auto-save — edit buffer must match vault file on disk
 */
test.describe.serial('@suite Editor persistence', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const seedPath = ensureE2ELinkSeed(workspace)
  let marker = ''
  let originalContent = ''

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    originalContent = readVaultFileUtf8(seedPath)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    try {
      const { writeFileSync } = await import('fs')
      writeFileSync(seedPath, originalContent, 'utf8')
    } catch {
      // best-effort restore
    }
    if (app) await closeElectronApp(app)
  })

  test('auto-save writes editor changes to disk', async () => {
    marker = `E2E_PERSIST_${Date.now()}`

    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })

    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(marker)

    await expect.poll(() => readVaultFileUtf8(seedPath).includes(marker), { timeout: 8_000 }).toBe(true)
    expectVaultFileContains(seedPath, marker)

    await closeTabByName(page, E2E_LINK_SEED_FILE)
  })

  test('theme toggle keeps unsaved editor buffer visible', async () => {
    const unsavedMarker = `E2E_THEME_BUFFER_${Date.now()}`

    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })

    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(unsavedMarker)

    // Repro path: toggle theme immediately before auto-save debounce flushes.
    await page.keyboard.press('Control+Shift+L')
    await expect(editor).toContainText(unsavedMarker, { timeout: 5_000 })
  })
})
