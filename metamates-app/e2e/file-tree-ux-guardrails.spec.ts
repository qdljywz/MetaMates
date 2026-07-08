import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from './helpers/launchElectron'
import {
  E2E_NOTE_PREFIX,
  E2E_SANDBOX_DIR_NAME,
  buildE2ENotePath,
  getE2EWorkspace,
  removeE2EFile,
} from './helpers/myM2Fixtures'
import { pickContextMenuItem, rightClickTreeTitle } from './helpers/contextMenu'
import { ensureFolderExpanded, ensureTreeFileVisible } from './helpers/treeActions'
import { WORKSPACE_LAYOUT } from '../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

test.describe('File tree UX guardrails (pinned)', () => {
  test('UX-08/09: new note in subfolder appears in tree and opens a tab', async () => {
    const workspace = getE2EWorkspace()
    const noteName = `${E2E_NOTE_PREFIX}${Date.now()}`
    const createdFilePath = buildE2ENotePath(workspace, noteName)
    const app = await launchMetaMatesApp(workspace)

    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      await waitForAppShell(page)
      await page.keyboard.press('Escape')
      await ensureFolderExpanded(page, PROJECTS_DIR)
      await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)

      await rightClickTreeTitle(page, E2E_SANDBOX_DIR_NAME)
      await pickContextMenuItem(page, /新建笔记|New Note/i)

      const modal = page.locator('.ant-modal').filter({ hasText: /新建笔记|New Note/i })
      await expect(modal).toBeVisible({ timeout: 5_000 })
      await modal.locator('input').fill(noteName)
      await modal.locator('input').press('Enter')

      await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteName })).toBeVisible({
        timeout: 15_000,
      })
      await ensureTreeFileVisible(page, noteName, [PROJECTS_DIR, E2E_SANDBOX_DIR_NAME])
    } finally {
      await closeElectronApp(app)
      removeE2EFile(createdFilePath)
    }
  })
})
