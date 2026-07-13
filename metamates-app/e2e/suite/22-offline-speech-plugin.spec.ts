import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow, waitForAppShell } from '../helpers/launchElectron'

/**
 * Offline speech extension install prompt (Whisper engine without plugin).
 *
 * Run: npm run test:e2e:offline-speech-plugin
 */
test.describe.serial('@suite Offline speech extension', () => {
  let app: ElectronApplication
  let page: Page

  test.afterEach(async () => {
    if (app) await closeElectronApp(app)
  })

  test('whisper engine without extension shows install prompt and opens extensions panel', async () => {
    test.setTimeout(180_000)

    app = await launchMetaMatesApp(undefined, { speechEngine: 'whisper', noDevPlugins: true })
    page = await resolveMainWindow(app)
    await waitForAppShell(page)

    test.skip(
      !(await page.locator('[data-testid="chat-input"]').isVisible().catch(() => false)),
      'Requires a detected AI assistant (chat input)',
    )

    const runtime = await page.evaluate(async () => {
      const plugin = await window.electronAPI?.plugins?.getOfflineSpeechStatus?.()
      const speech = await window.electronAPI?.speech?.isAvailable?.()
      return {
        pluginInstalled: plugin?.installed === true,
        whisperAvailable: speech?.whisper === true,
      }
    })
    expect(runtime.pluginInstalled).toBe(false)
    expect(runtime.whisperAvailable).toBe(false)

    const voiceBtn = page.locator('[data-testid="voice-button"]')
    const hint = page.locator('[data-testid="agent-input-hint"]')

    await voiceBtn.click()

    await expect(hint).toContainText(/离线语音|Offline Speech|Whisper/i, { timeout: 8_000 })
    const installLink = page.locator('[data-testid="voice-install-extension"]')
    await expect(installLink).toBeVisible({ timeout: 5_000 })

    await installLink.click()

    const pluginCard = page.locator('[data-testid="plugin-card-offline-speech"]')
    await expect(pluginCard).toBeVisible({ timeout: 10_000 })
    await expect(pluginCard).toContainText(/未安装|Not installed/i)
    await expect(pluginCard).toContainText(/离线语音|Offline Speech/i)
  })

  test('auto engine without extension does not show whisper install prompt', async () => {
    test.setTimeout(180_000)

    app = await launchMetaMatesApp(undefined, { speechEngine: 'auto', noDevPlugins: true })
    page = await resolveMainWindow(app)
    await waitForAppShell(page)

    const voiceBtn = page.locator('[data-testid="voice-button"]')
    await voiceBtn.click()
    await page.waitForTimeout(800)

    await expect(page.locator('[data-testid="voice-install-extension"]')).toHaveCount(0)

    const hintText = (await page.locator('[data-testid="agent-input-hint"]').textContent()) ?? ''
    expect(hintText).not.toMatch(/需要安装.*离线语音|Install the Offline Speech extension/i)
  })
})
