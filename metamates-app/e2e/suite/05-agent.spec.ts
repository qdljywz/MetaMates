import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow, waitForAppShell } from '../helpers/launchElectron'

/**
 * @suite ACP agent toolbar & chat input (optional when no local CLI)
 */
test.describe.serial('@suite Agent chat', () => {
  let app: ElectronApplication
  let page: Page
  let agentAvailable = false

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app)
    await waitForAppShell(page)

    const pills = page.locator('[data-testid^="agent-sidebar-"]')
    agentAvailable = (await pills.count()) > 0
  })

  test.afterAll(async () => {
    if (app) {
      await closeElectronApp(app)
    }
  })

  test('agent toolbar and chat input are usable', async () => {
    if (!agentAvailable) test.skip(true, 'No local CLI in E2E profile — agent sidebar buttons optional')

    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible({ timeout: 30_000 })
    await chatInput.fill('E2E ping')
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled()
  })

  test('input hint keeps stable reserved height', async () => {
    if (!agentAvailable) test.skip(true, 'No local CLI in E2E profile — agent sidebar buttons optional')

    const footer = page.locator('.agent-panel__footer')
    const hint = page.locator('[data-testid="agent-input-hint"]')
    await expect(footer).toBeVisible({ timeout: 30_000 })
    await expect(hint).toBeVisible({ timeout: 30_000 })

    const measureHeights = async () => {
      return hint.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        const footerEl = el.closest('.agent-panel__footer')
        return {
          hintHeight: el.getBoundingClientRect().height,
          footerHeight: footerEl?.getBoundingClientRect().height ?? 0,
          minHeight: computed.minHeight,
          maxHeight: computed.maxHeight,
          lineHeight: computed.lineHeight,
          overflow: computed.overflow,
        }
      })
    }

    const baseline = await measureHeights()
    expect(baseline.minHeight).toBe(baseline.maxHeight)
    expect(baseline.minHeight).not.toBe('0px')
    expect(baseline.lineHeight).not.toBe('normal')
    expect(baseline.overflow).toBe('hidden')
    expect(baseline.hintHeight).toBeGreaterThan(0)
    expect(baseline.footerHeight).toBeGreaterThan(0)

    const voiceButton = page.locator('[data-testid="voice-button"]')
    await voiceButton.click()
    await expect
      .poll(async () => (await hint.textContent())?.trim().length ?? 0, { timeout: 5_000 })
      .toBeGreaterThan(0)

    const afterVoice = await measureHeights()
    expect(afterVoice.hintHeight).toBeCloseTo(baseline.hintHeight, 0)
    expect(afterVoice.footerHeight).toBeCloseTo(baseline.footerHeight, 0)

    await voiceButton.click()
    const afterStop = await measureHeights()
    expect(afterStop.hintHeight).toBeCloseTo(baseline.hintHeight, 0)
    expect(afterStop.footerHeight).toBeCloseTo(baseline.footerHeight, 0)
  })
})
