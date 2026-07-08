import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { E2E_LINK_SEED_FILE, ensureE2ELinkSeed, getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'
import { openGlobalSearch } from '../helpers/shortcuts'

/**
 * @suite Global search — index, query, open result into editor tab
 */
test.describe.serial('@suite Global search', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    ensureE2ELinkSeed(getE2EWorkspace())
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('finds seeded note and opens it in a tab', async () => {
    await openGlobalSearch(page)

    const modal = page.locator('.ant-modal').filter({
      has: page.locator('input[placeholder*="搜索笔记"], input[placeholder*="Search notes"]'),
    })
    await expect(modal).toBeVisible({ timeout: 10_000 })

    const spin = modal.locator('.ant-spin')
    if (await spin.isVisible().catch(() => false)) {
      await expect(spin).toBeHidden({ timeout: 120_000 })
    }

    const searchInput = modal.locator('input[placeholder*="搜索笔记"], input[placeholder*="Search notes"]')
    await searchInput.fill('E2E link seed')

    await expect(modal.locator('.ant-list-item').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 30_000,
    })
    await modal.locator('.ant-list-item').filter({ hasText: E2E_LINK_SEED_FILE }).first().click()

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('.cm-content')).toBeVisible()
    await closeTabByName(page, E2E_LINK_SEED_FILE)
  })
})
