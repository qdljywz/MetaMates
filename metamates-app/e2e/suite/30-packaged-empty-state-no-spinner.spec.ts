/**
 * Packaged regression: center empty-state must not re-show spinner during Agent CLI connect.
 *
 * Failure mode: agentHint polls every ~2s during connect → loading=true → long "思考引擎" spin.
 *
 * Run: npm run test:e2e:packaged:empty-state
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  resolvePackagedExe,
  waitForAppShell,
  warmUpAgentConnection,
} from '../helpers/launchElectron'
import { closeAllTabs } from '../helpers/assertions'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'

test.describe.serial('@suite Packaged empty-state spinner guard', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const backend = process.env.E2E_AGENT_BACKEND?.trim() || 'claude'

  test.beforeAll(async () => {
    const exe = resolvePackagedExe()
    test.skip(!exe, 'Packaged MetaMates.exe missing')
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('empty-state question stays visible — no spinner flash during agent connect', async () => {
    test.setTimeout(180_000)

    await closeAllTabs(page)
    await expect(page.locator('[data-testid="editor-empty-state"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="editor-empty-state-question"]')).toBeVisible({
      timeout: 90_000,
    })

    let sawQuestion = true
    let spinnerAfterQuestion = false

    const monitor = (async () => {
      const end = Date.now() + 90_000
      while (Date.now() < end) {
        const loading = await page.locator('.editor-empty-state__loading').isVisible()
        const question = await page.locator('[data-testid="editor-empty-state-question"]').isVisible()
        if (question) sawQuestion = true
        if (sawQuestion && loading) spinnerAfterQuestion = true
        await page.waitForTimeout(1500)
      }
    })()

    const warmup = warmUpAgentConnection(page, { backend, workspace, maxMs: 120_000 })
    await Promise.all([monitor, warmup])

    expect(spinnerAfterQuestion, 'spinner reappeared after empty-state question was shown').toBe(false)
    await expect(page.locator('[data-testid="editor-empty-state-question"]')).toBeVisible()
  })
})
