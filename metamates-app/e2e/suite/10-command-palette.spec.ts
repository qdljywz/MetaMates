import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { ensureE2ESandbox, getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeTabByName, expectCommandPaletteVisible } from '../helpers/assertions'
import { openCommandPalette } from '../helpers/shortcuts'
import { vaultFileExists } from '../helpers/vaultAssert'
import {
  getDailyNoteFileName,
  getDailyNotePath,
  getTodayDateString,
} from '../../src/constants/paths'

/**
 * @suite Command palette — daily note command creates/opens file + tab
 */
test.describe.serial('@suite Command palette actions', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const today = getTodayDateString()
  const noteFileName = getDailyNoteFileName(today)
  const notePath = getDailyNotePath(workspace, today, 'zh')

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    ensureE2ESandbox(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('create daily note command opens tab and file on disk', async () => {
    await openCommandPalette(page)
    await expectCommandPaletteVisible(page)

    const palette = page.locator('.ant-modal-wrap').filter({
      has: page.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]'),
    })
    const input = palette.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]')
    await input.fill('daily')

    const dailyItem = palette.locator('strong').filter({ hasText: /创建今日笔记|Create today/i })
    await expect(dailyItem.first()).toBeVisible({ timeout: 10_000 })
    await dailyItem.first().click()

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(notePath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, noteFileName)
    await page.keyboard.press('Escape')
  })

  test('switch workspace command appears in command mode', async () => {
    await openCommandPalette(page)
    await expectCommandPaletteVisible(page)

    const palette = page.locator('.ant-modal-wrap').filter({
      has: page.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]'),
    })
    const input = palette.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]')
    await input.fill('> workspace')

    const switchItem = palette.locator('strong').filter({ hasText: /切换工作区|Switch Workspace/i })
    await expect(switchItem.first()).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  })
})
