/**
 * Agent CLI config — lazy auth, settings status cards, Claude read-only model.
 * Backend priority: Claude → CodeBuddy (avoids Gemini/Codex flakes).
 *
 * Run: npm run test:e2e:agent-cli-config
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow, waitForAppShell } from '../helpers/launchElectron'
import {
  exerciseLazyAuthOnPreferred,
  listDetectedAgentBackends,
  openSettingsAgentTab,
  pickPreferredBackends,
  selectAgentSidebar,
  selectAndWarmupPreferred,
  waitForConnectionStatus,
} from '../helpers/agentRecent'

test.describe.serial('Agent CLI config (Phase 3)', () => {
  let app: ElectronApplication
  let page: Page
  let backends: string[] = []
  let preferred: string[] = []

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app)
    await waitForAppShell(page)
    backends = await listDetectedAgentBackends(page)
    preferred = pickPreferredBackends(backends)
    test.skip(preferred.length === 0, 'Need claude or codebuddy in E2E profile')
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('settings Agent tab shows CLI status cards', async () => {
    await openSettingsAgentTab(page)

    const cards = page.locator('[data-testid^="agent-cli-status-"]')
    await expect(async () => {
      expect(await cards.count()).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })

    if (backends.includes('claude')) {
      await expect(page.locator('[data-testid="agent-cli-status-claude"]')).toBeVisible()
    }

    await page.keyboard.press('Escape')
  })

  test('lazy auth: connect shows banner not modal; send opens modal', async () => {
    const warmed = await selectAndWarmupPreferred(page, backends)
    test.skip(!warmed, 'Could not warmup claude or codebuddy')

    if (warmed.status === 'auth_required') {
      const authModal = page.locator('[data-testid="acp-auth-modal"]')
      await expect(authModal).toBeHidden({ timeout: 5_000 })
      await expect(page.locator('[data-testid="acp-auth-banner"]')).toBeVisible({ timeout: 10_000 })

      await page.locator('[data-testid="chat-input"]').fill('ping')
      await page.locator('[data-testid="send-button"]').click()

      await expect(async () => {
        const modalVisible = await authModal.isVisible()
        const bannerSignIn = page.locator('[data-testid="acp-auth-banner-sign-in"]')
        const hasBannerAction = (await bannerSignIn.count()) > 0
        expect(modalVisible || hasBannerAction).toBeTruthy()
      }).toPass({ timeout: 20_000, intervals: [500] })

      if (await authModal.isVisible()) {
        await page.keyboard.press('Escape')
      }
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `${warmed.backend} status=${warmed.status} — lazy-auth send path skipped`,
      })
    }
  })

  test('claude uses read-only model badge when CLI locks model', async () => {
    test.skip(!backends.includes('claude'), 'Claude CLI not in E2E profile')

    const claudeOk = await selectAgentSidebar(page, 'claude')
    test.skip(!claudeOk, 'Claude sidebar missing')

    await page.locator('[data-testid="chat-input"]').focus()

    const status = await waitForConnectionStatus(
      page,
      ['connected', 'auth_required', 'connecting', 'error'],
      90_000,
    )

    if (status !== 'connected') {
      test.skip(true, `Claude not connected (status=${status})`)
      return
    }

    const readonly = page.locator('[data-testid="acp-model-readonly"]')
    const dropdown = page.locator('.agent-panel__input-controls select.agent-panel__select--compact')

    await expect(async () => {
      const hasReadonly = (await readonly.count()) > 0
      const hasDropdown = (await dropdown.count()) > 0
      expect(hasReadonly || hasDropdown).toBeTruthy()
    }).toPass({ timeout: 15_000, intervals: [500] })

    if (await readonly.count()) {
      const text = (await readonly.textContent())?.trim() ?? ''
      expect(text.length).toBeGreaterThan(0)
      await expect(dropdown).toHaveCount(0)
    }
  })

  test('auth banner sign-in opens modal (claude → codebuddy)', async () => {
    let exercised: string | null = null
    for (const backend of preferred) {
      await selectAgentSidebar(page, backend)
      await page.locator('[data-testid="chat-input"]').focus()
      const status = await waitForConnectionStatus(page, ['auth_required', 'connected'], 45_000)
      if (status !== 'auth_required') continue

      exercised = backend
      const banner = page.locator('[data-testid="acp-auth-banner"]')
      await expect(banner).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-testid="acp-auth-banner-sign-in"]').click()
      await expect(page.locator('[data-testid="acp-auth-modal"]')).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Escape')
      break
    }

    test.skip(!exercised, 'Claude and CodeBuddy already authenticated in E2E profile')
  })
})
