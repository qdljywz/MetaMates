import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  resolvePackagedExe,
  waitForAppShell,
} from '../helpers/launchElectron'
import { openSettingsModal, settingsModalLocator } from '../helpers/comprehensiveAudit'
import { expectNoFirstRunModals, expectSplashDismissed } from '../helpers/assertions'

test.describe.serial('@suite Packaged Windows smoke', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    const exe = resolvePackagedExe()
    test.skip(!exe, 'release/win-unpacked/MetaMates.exe missing — run electron:build:win first')
    app = await launchMetaMatesApp(undefined, { noDevPlugins: true })
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    await closeElectronApp(app)
  })

  test('01 packaged exe launches with shell visible', async () => {
    await expectSplashDismissed(page)
    await expectNoFirstRunModals(page)
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible()
    await expect(page.locator('.status-bar')).toBeVisible()
  })

  test('02 settings modal opens on General tab', async () => {
    await openSettingsModal(page)
    const modal = settingsModalLocator(page)
    await expect(modal.getByText(/主题|Theme/).first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('03 agent panel input is present', async () => {
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 15_000 })
  })

  test('04 agent sidebar shows brand SVGs not letter initials', async () => {
    const branded = ['claude', 'codebuddy', 'gemini'] as const
    let checked = 0
    for (const backend of branded) {
      const pill = page.locator(`[data-testid="agent-sidebar-${backend}"]`)
      if ((await pill.count()) === 0) continue
      checked += 1
      await expect(pill.locator('img')).toBeVisible({ timeout: 5_000 })
      const src = await pill.locator('img').getAttribute('src')
      expect(src, `${backend} logo src`).toMatch(new RegExp(`assets/${backend}\\.svg`))
    }
    test.skip(checked === 0, 'no branded agents detected in packaged smoke environment')
  })
})
