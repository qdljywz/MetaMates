import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  expectSplashDismissedWithinBudget,
  launchMetaMatesApp,
  resolveE2EWorkspacePath,
  resolveMainWindow,
} from './helpers/launchElectron'

test.describe('Startup UX guardrails (pinned)', () => {
  test('splash dismisses within force-enter budget', async () => {
    const workspace = resolveE2EWorkspacePath()
    const app = await launchMetaMatesApp(workspace)
    try {
      const elapsed = await expectSplashDismissedWithinBudget(app)
      expect(elapsed).toBeGreaterThanOrEqual(0)
    } finally {
      await closeElectronApp(app)
    }
  })

  test('workspace picker hidden when vault is already loaded', async () => {
    const workspace = resolveE2EWorkspacePath()
    const app = await launchMetaMatesApp(workspace)
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })
      await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 30_000 })

      const picker = page
        .locator('.ant-modal-wrap')
        .filter({ hasText: /选择工作区|Select Workspace/i })
      await expect(picker).toHaveCount(0)
    } finally {
      await closeElectronApp(app)
    }
  })
})
