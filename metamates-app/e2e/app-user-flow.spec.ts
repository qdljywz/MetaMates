import { test, expect } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveE2EWorkspacePath,
  resolveMainWindow,
} from './helpers/launchElectron'

/**
 * Real desktop E2E — launches Electron, injects E:\MyM2 via METAMATES_E2E,
 * then simulates user clicks (activity bar, command palette, file tree).
 *
 * This is NOT the browser-only smoke.spec.ts (page.goto without electronAPI).
 */
test.describe('Desktop user flow (Electron)', () => {
  test('launches app, loads vault, and responds to UI clicks', async () => {
    const workspace = resolveE2EWorkspacePath()
    const app = await launchMetaMatesApp(workspace)
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })

      const shell = await page.evaluate(() => ({
        hasElectronAPI: typeof window.electronAPI !== 'undefined',
        e2eWorkspace: (window as Window & { __METAMATES_E2E__?: { workspace?: string } }).__METAMATES_E2E__?.workspace ?? '',
        hasFileTree: !!document.querySelector('[data-testid="file-tree"]'),
        hasToolbar: !!document.querySelector('[data-testid="agent-toolbar"]'),
      }))

      expect(shell.hasElectronAPI, 'must run inside Electron preload, not bare browser').toBe(true)
      expect(shell.e2eWorkspace.replace(/\\/g, '/').toLowerCase()).toBe(
        workspace.replace(/\\/g, '/').toLowerCase(),
      )
      expect(shell.hasFileTree).toBe(true)
      expect(shell.hasToolbar).toBe(true)

      // User action: open command palette (Ctrl+P)
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }),
        )
      })
      const palette = page.locator('.ant-modal-wrap input[placeholder*="搜索"], .ant-modal-wrap input[placeholder*="Search"]')
      await expect(palette.first()).toBeVisible({ timeout: 8000 })
      await page.keyboard.press('Escape')

      // User action: click knowledge graph on activity bar
      await page.click('[data-testid="activity-graph"]', { timeout: 8000 })
      await expect(page.locator('.graph-modal').first()).toBeVisible({ timeout: 15_000 })
      await page.keyboard.press('Escape')

      // User action: ensure file tree panel is open, then click first folder
      const fileTreePanel = page.locator('[data-testid="file-tree"]')
      await expect(fileTreePanel).toBeVisible({ timeout: 8000 })
      const treeNode = page.locator('.ant-tree-treenode:not([aria-hidden="true"]) .ant-tree-node-content-wrapper').first()
      await expect(treeNode).toBeVisible({ timeout: 15_000 })
      await treeNode.click()
    } finally {
      await closeElectronApp(app)
    }
  })
})
