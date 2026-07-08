import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { ensureE2ESandbox, getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'
import { vaultFileExists } from '../helpers/vaultAssert'
import {
  getDailyNoteFileName,
  getDailyPlanFileName,
  getDailyNotePath,
  getDailyPlanPath,
  getTodayDateString,
} from '../../src/constants/paths'

/**
 * @suite Daily calendar — double-click note, Shift+click plan (disk + tab)
 */
test.describe.serial('@suite Daily calendar', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const today = getTodayDateString()
  const noteFileName = getDailyNoteFileName(today)
  const planFileName = getDailyPlanFileName(today)
  const notePath = getDailyNotePath(workspace, today, 'zh')
  const planPath = getDailyPlanPath(workspace, today, 'zh')

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    ensureE2ESandbox(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
    await expect(page.locator('.vault-activity-calendar')).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('double-click today opens or creates daily note on disk', async () => {
    await page.locator(`[data-testid="calendar-date-${today}"]`).dblclick()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(notePath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, noteFileName)
  })

  test('Shift+click today opens or creates daily PLAN on disk', async () => {
    const todayButton = page.locator(`[data-testid="calendar-date-${today}"]`)
    await todayButton.click({ modifiers: ['Shift'] })
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(planPath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, planFileName)
  })
})
