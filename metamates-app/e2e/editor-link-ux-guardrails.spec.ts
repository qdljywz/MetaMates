import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from './helpers/launchElectron'
import {
  E2E_LINK_SEED_FILE,
  E2E_SANDBOX_DIR_NAME,
  ensureE2ELinkSeed,
  getE2EWorkspace,
} from './helpers/myM2Fixtures'
import { ensureFolderExpanded } from './helpers/treeActions'
import { WORKSPACE_LAYOUT } from '../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

test.describe('Editor link picker UX guardrails (pinned)', () => {
  test('UX-11: wiki link picker hides CLI skill files', async () => {
    const workspace = getE2EWorkspace()
    ensureE2ELinkSeed(workspace)
    const app = await launchMetaMatesApp(workspace)

    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      await waitForAppShell(page)

      await ensureFolderExpanded(page, PROJECTS_DIR)
      await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
      await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()

      await expect(
        page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE }),
      ).toBeVisible({ timeout: 10_000 })

      await page.locator('.cm-content').click()
      await page.getByRole('button', { name: '[[ ]]' }).click()

      const modal = page.locator('.ant-modal').filter({
        hasText: /选择或创建链接目标|Select or create link target/i,
      })
      await expect(modal).toBeVisible({ timeout: 10_000 })
      await expect(modal.locator('.ant-list-item').filter({ hasText: 'challenge' })).toHaveCount(0)
      await expect(modal.locator('.ant-list-item').filter({ hasText: 'e2e-link-seed' })).toHaveCount(1)
    } finally {
      await closeElectronApp(app)
    }
  })
})
