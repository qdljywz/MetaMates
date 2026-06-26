import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

async function resolveMainWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  const win = await app.waitForEvent('window', { timeout: 60_000 })
  await win.waitForLoadState('domcontentloaded')
  await win.locator('[data-testid="chat-input"]').waitFor({ state: 'visible', timeout: 30_000 })
  await new Promise((r) => setTimeout(r, 3000))
  return win
}

async function closeElectronApp(app: Awaited<ReturnType<typeof electron.launch>>) {
  await Promise.race([
    app.close(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]).catch(() => {})
}

test.describe('Lazy warmup (AionUi-style startup)', () => {
  test('detects agents without auto-connecting all CLIs', async () => {
    const app = await electron.launch({ args: ['.'], cwd: ROOT })
    try {
      const page = await resolveMainWindow(app)

      await expect(page.locator('[data-testid="agent-toolbar"]')).toBeVisible({ timeout: 30000 })

      const agentButtons = page.locator('[data-testid^="agent-sidebar-"]')
      await expect(agentButtons.first()).toBeVisible({ timeout: 15000 })
      const count = await agentButtons.count()
      expect(count).toBeGreaterThan(0)

      const status = page.locator('[data-testid="acp-connection-status"]')
      await expect(status).toBeVisible()
      const initial = await status.getAttribute('data-status')
      expect(initial).toBe('disconnected')

      const chatInput = page.locator('[data-testid="chat-input"]')
      await expect(chatInput).toBeEnabled({ timeout: 5000 })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('focus input triggers warmup (connecting or auth_required)', async () => {
    const app = await electron.launch({ args: ['.'], cwd: ROOT })
    try {
      const page = await resolveMainWindow(app)

      await page.locator('[data-testid="chat-input"]').focus()
      const status = page.locator('[data-testid="acp-connection-status"]')

      await expect(async () => {
        const value = await status.getAttribute('data-status')
        expect(['connecting', 'auth_required', 'connected']).toContain(value)
      }).toPass({ timeout: 45000, intervals: [1000] })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('gemini without OAuth shows auth modal after warmup', async () => {
    const app = await electron.launch({ args: ['.'], cwd: ROOT })
    try {
      const page = await resolveMainWindow(app)

      const geminiBtn = page.locator('[data-testid="agent-sidebar-gemini"]')
      if (await geminiBtn.count()) {
        await geminiBtn.click({ force: true })
      }

      await page.locator('[data-testid="chat-input"]').focus()

      await expect(async () => {
        const authModal = page.locator('[data-testid="acp-auth-modal"]')
        const status = await page.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
        const hasModal = await authModal.count() > 0
        expect(hasModal || status === 'auth_required').toBeTruthy()
      }).toPass({ timeout: 45000, intervals: [1000] })
    } finally {
      await closeElectronApp(app)
    }
  })

  test('switching agent dismisses another agent auth modal', async () => {
    test.setTimeout(180_000)

    const app = await electron.launch({ args: ['.'], cwd: ROOT })
    try {
      const page = await resolveMainWindow(app)
      const authModal = page.locator('[data-testid="acp-auth-modal"]')

      const geminiBtn = page.locator('[data-testid="agent-sidebar-gemini"]')
      const codebuddyBtn = page.locator('[data-testid="agent-sidebar-codebuddy"]')
      if (!(await geminiBtn.count()) || !(await codebuddyBtn.count())) {
        test.skip()
        return
      }

      await geminiBtn.click({ force: true })
      await page.locator('[data-testid="chat-input"]').focus()

      await expect(async () => {
        const hasModal = await authModal.isVisible()
        const status = await page.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
        expect(hasModal || status === 'auth_required').toBeTruthy()
      }).toPass({ timeout: 45000, intervals: [1000] })

      await codebuddyBtn.click({ force: true })
      await expect(authModal).toBeHidden({ timeout: 15000 })

      const status = await page.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
      expect(status).not.toBe('auth_required')
    } finally {
      await closeElectronApp(app)
    }
  })
})
