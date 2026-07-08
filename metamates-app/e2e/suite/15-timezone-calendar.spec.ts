import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'
import { vaultFileExists } from '../helpers/vaultAssert'
import {
  getDailyPlanFileName,
  getDailyPlanPath,
  WORKSPACE_LAYOUT,
} from '../../src/constants/paths'

const TEST_TIMEZONE = 'Etc/UTC'

async function setUserTimezone(page: Page, timezone: string): Promise<void> {
  await page.evaluate(async (tz) => {
    const raw = localStorage.getItem('metamates-storage')
    const data = raw ? JSON.parse(raw) : { settings: {}, workspace: {}, commandHistory: [], version: '1.0.0' }
    data.settings = { ...data.settings, userTimezone: tz }
    localStorage.setItem('metamates-storage', JSON.stringify(data))
    const dispatch = (window as { __metamatesE2EDispatch?: (action: unknown) => void }).__metamatesE2EDispatch
    dispatch?.({ type: 'UPDATE_SETTINGS', payload: { userTimezone: tz } })
  }, timezone)
}

async function todayInTimezone(page: Page, timezone: string): Promise<string> {
  return page.evaluate(async (tz) => {
    const { getTodayDateString } = await import('/src/constants/paths.ts')
    return getTodayDateString(tz)
  }, timezone)
}

/**
 * @suite Timezone — settings propagate to calendar today + PLAN path
 */
test.describe.serial('@suite Timezone & calendar', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
    await expect(page.locator('.vault-activity-calendar')).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    await setUserTimezone(page, 'Asia/Shanghai')
    if (app) await closeElectronApp(app)
  })

  test('calendar highlights today using configured timezone', async () => {
    await expect
      .poll(async () => page.evaluate(() => typeof (window as any).__metamatesE2EDispatch === 'function'), {
        timeout: 30_000,
      })
      .toBe(true)

    await setUserTimezone(page, TEST_TIMEZONE)
    const todayUtc = await todayInTimezone(page, TEST_TIMEZONE)
    const planFileName = getDailyPlanFileName(todayUtc)

    const todayCell = page.locator(`[data-testid="calendar-date-${todayUtc}"]`)
    await expect(todayCell).toBeVisible({ timeout: 15_000 })

    await expect
      .poll(async () => {
        const border = await todayCell.evaluate((el) => getComputedStyle(el).borderColor)
        return border.includes('255') || border.includes('rgb(255')
      })
      .toBe(true)

    await todayCell.click({ modifiers: ['Shift'] })
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName })).toBeVisible({
      timeout: 15_000,
    })

    const planPath = getDailyPlanPath(workspace, todayUtc, 'zh')
    await expect.poll(() => vaultFileExists(planPath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, planFileName)
  })

  test('slash prompt includes configured timezone', async () => {
    const prompt = await page.evaluate(async (tz) => {
      const { assembleSlashPrompt } = await import('/src/commands/assembleSlashPrompt.ts')
      const { getAgentSlashCommands } = await import('/src/commands/agentSlashCommands.ts')
      const cmd = getAgentSlashCommands('zh').find((c) => c.id === '/today')!
      return assembleSlashPrompt({ cmd, language: 'zh', timezone: tz })
    }, TEST_TIMEZONE)

    expect(prompt).toContain(TEST_TIMEZONE)
    expect(prompt).toContain('生效时区')
  })
})
