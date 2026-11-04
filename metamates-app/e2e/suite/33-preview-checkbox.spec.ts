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
  E2E_SANDBOX_DIR_NAME,
  ensureE2ESandbox,
  getE2EWorkspace,
} from '../helpers/myM2Fixtures'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { readVaultFileUtf8 } from '../helpers/vaultAssert'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS
const CHECKBOX_FILE = 'e2e-preview-checkbox.md'
const OPEN_LABEL = 'E2E preview checkbox open task'

/**
 * @suite Preview checkbox toggle → source `[x]` writeback
 * Failure mode: preview Ant checkbox is display-only; click does not flip markdown.
 */
test.describe.serial('@suite Preview checkbox toggle', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeAll(async () => {
    const workspace = getE2EWorkspace()
    const sandbox = ensureE2ESandbox(workspace)
    filePath = path.join(sandbox, CHECKBOX_FILE)
    fs.writeFileSync(
      filePath,
      `# Preview checkbox E2E\n\n- [ ] ${OPEN_LABEL}\n- [x] already done\n`,
      'utf8',
    )

    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      /* ignore cleanup */
    }
  })

  test('click preview checkbox flips [ ] to [x] and persists', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: CHECKBOX_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: CHECKBOX_FILE })).toBeVisible({
      timeout: 15_000,
    })

    await page.locator('.editor-area button .anticon-eye').locator('..').click()
    await expect(page.locator('.cm-content')).toBeHidden({ timeout: 5_000 })

    const row = page.locator('[data-testid="md-preview-checkbox"]').filter({ hasText: OPEN_LABEL })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.locator('.ant-checkbox-checked')).toHaveCount(0)

    await row.locator('input.ant-checkbox-input').click({ force: true })

    await expect(row.locator('.ant-checkbox-checked')).toHaveCount(1, { timeout: 5_000 })

    await expect
      .poll(() => readVaultFileUtf8(filePath).includes(`- [x] ${OPEN_LABEL}`), {
        timeout: 20_000,
        intervals: [400],
      })
      .toBe(true)
  })
})
