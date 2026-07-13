import { test, expect } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow } from './helpers/launchElectron'
import {
  listDetectedAgentBackends,
  pickPreferredBackends,
  primaryPreferredBackend,
  secondaryPreferredBackend,
  selectAgentSidebar,
} from './helpers/agentRecent'
import { waitForConnectionStatus } from './helpers/agentSettings'

test.describe.configure({ mode: 'serial' })

test.describe('Lazy warmup (AionUi-style startup)', () => {
  test('detects agents without auto-connecting all CLIs', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app)

      await expect(page.locator('[data-testid="agent-toolbar"]')).toBeVisible({ timeout: 30_000 })

      const agentButtons = page.locator('[data-testid^="agent-sidebar-"]')
      await expect(agentButtons.first()).toBeVisible({ timeout: 15_000 })
      const count = await agentButtons.count()
      expect(count).toBeGreaterThan(0)

      const status = page.locator('[data-testid="acp-connection-status"]')
      await expect(status).toBeVisible()
      const initial = await status.getAttribute('data-status')
      expect(['disconnected', 'connecting'].includes(initial ?? '')).toBe(true)

      const chatInput = page.locator('[data-testid="chat-input"]')
      await expect(chatInput).toBeEnabled({ timeout: 5000 })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('focus input triggers warmup on preferred backend (claude → codebuddy)', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app)
      const backends = await listDetectedAgentBackends(page)
      const primary = primaryPreferredBackend(backends)
      test.skip(!primary, 'Need claude or codebuddy in E2E profile')

      await selectAgentSidebar(page, primary)
      await page.locator('[data-testid="chat-input"]').focus()
      const status = page.locator('[data-testid="acp-connection-status"]')

      await expect(async () => {
        const value = await status.getAttribute('data-status')
        expect(['connecting', 'auth_required', 'connected', 'disconnected', 'error']).toContain(value)
      }).toPass({ timeout: 45_000, intervals: [1000] })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('preferred backend shows auth banner after warmup, not modal (lazy auth)', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app)
      const backends = await listDetectedAgentBackends(page)
      const preferred = pickPreferredBackends(backends)
      test.skip(preferred.length === 0, 'Need claude or codebuddy in E2E profile')

      await selectAgentSidebar(page, preferred[0]!)
      await page.locator('[data-testid="chat-input"]').focus()

      await expect(async () => {
        const authModal = page.locator('[data-testid="acp-auth-modal"]')
        const status = await page.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
        const banner = page.locator('[data-testid="acp-auth-banner"]')
        const hasBanner = (await banner.count()) > 0
        const hasModal = (await authModal.count()) > 0 && (await authModal.isVisible())
        if (status === 'auth_required') {
          expect(hasModal).toBe(false)
          expect(hasBanner).toBe(true)
        } else {
          expect(['connected', 'connecting', 'error', 'disconnected'].includes(status ?? '')).toBeTruthy()
        }
      }).toPass({ timeout: 45_000, intervals: [1000] })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('switching agent dismisses another agent auth modal (claude → codebuddy)', async () => {
    test.setTimeout(180_000)

    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app)
      const authModal = page.locator('[data-testid="acp-auth-modal"]')
      const backends = await listDetectedAgentBackends(page)
      const primary = primaryPreferredBackend(backends)
      const secondary = secondaryPreferredBackend(backends)
      test.skip(!primary || !secondary, 'Need both claude and codebuddy in E2E profile')

      await selectAgentSidebar(page, primary)
      await page.locator('[data-testid="chat-input"]').focus()

      const status = await waitForConnectionStatus(
        page,
        ['auth_required', 'connected', 'connecting', 'error'],
        45_000,
      )

      await expect(authModal).toBeHidden({ timeout: 5_000 })
      if (status === 'auth_required') {
        await expect(page.locator('[data-testid="acp-auth-banner"]')).toBeVisible({ timeout: 10_000 })
      }

      await selectAgentSidebar(page, secondary)
      await expect(authModal).toBeHidden({ timeout: 15_000 })

      const finalStatus = await page.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
      expect(finalStatus).not.toBe('auth_required')
    } finally {
      await closeElectronApp(app)
    }
  })
})
