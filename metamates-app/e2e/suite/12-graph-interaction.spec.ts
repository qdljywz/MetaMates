import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { E2E_LINK_SEED_FILE, ensureE2ELinkSeed, getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'

/**
 * @suite Knowledge graph — search node and open file from canvas double-click
 */
test.describe.serial('@suite Graph interaction', () => {
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

  test('search node then double-click canvas opens editor tab', async () => {
    await page.click('[data-testid="activity-graph"]', { timeout: 8_000 })
    const graphModal = page.locator('.graph-modal').first()
    await expect(graphModal).toBeVisible({ timeout: 15_000 })

    const spin = graphModal.locator('.ant-spin')
    if (await spin.isVisible().catch(() => false)) {
      await expect(spin).toBeHidden({ timeout: 120_000 })
    }

    await graphModal.locator('.ant-segmented-item-label').filter({ hasText: /全景|Full/i }).click()

    const searchInput = graphModal.locator('input[placeholder*="搜索节点"], input[placeholder*="Search nodes"]')
    await searchInput.fill('e2e-link-seed')

    await expect(graphModal.getByText(/节点:\s*[1-9]/)).toBeVisible({ timeout: 60_000 })

    const canvas = graphModal.locator('[data-testid="graph-2d-canvas"]')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    await canvas.dblclick({ position: { x: box!.width / 2, y: box!.height / 2 } })

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })
    await expect(graphModal).toBeHidden({ timeout: 10_000 })

    await closeTabByName(page, E2E_LINK_SEED_FILE)
  })

  test('toggle 3D mode shows WebGL canvas then returns to 2D', async () => {
    await page.click('[data-testid="activity-graph"]', { timeout: 8_000 })
    const graphModal = page.locator('.graph-modal').first()
    await expect(graphModal).toBeVisible({ timeout: 15_000 })

    const spin = graphModal.locator('.ant-spin')
    if (await spin.isVisible().catch(() => false)) {
      await expect(spin).toBeHidden({ timeout: 120_000 })
    }

    await graphModal.locator('.ant-segmented-item-label').filter({ hasText: /全景|Full/i }).click()
    await graphModal.locator('input[placeholder*="搜索节点"], input[placeholder*="Search nodes"]').fill('e2e-link-seed')
    await expect(graphModal.getByText(/节点:\s*[1-9]/)).toBeVisible({ timeout: 60_000 })

    const canvas2d = graphModal.locator('[data-testid="graph-2d-canvas"]')
    await expect(canvas2d).toBeVisible()

    await graphModal.locator('[data-testid="graph-3d-switch"]').click()
    const canvas3d = graphModal.locator('[data-testid="graph-3d-canvas"]')
    await expect(canvas3d).toBeVisible({ timeout: 15_000 })
    await expect(canvas2d).toBeHidden()

    await graphModal.locator('[data-testid="graph-3d-switch"]').click()
    await expect(canvas2d).toBeVisible({ timeout: 15_000 })
    await expect(canvas3d).toBeHidden()

    await graphModal.locator('.ant-modal-close').click()
    await expect(graphModal).toBeHidden({ timeout: 10_000 })
  })
})
