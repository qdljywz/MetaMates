/**
 * E2E: open Settings and click「重新同步 CLI Skills」.
 * Expects workspace already configured (localStorage) and Codex CLI installed.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WORKSPACE = process.env.MM_TEST_WORKSPACE || 'E:\\Trae\\Metamates\\Test\\test0407'
const CODEX_SKILLS = path.join(WORKSPACE, '.codex', 'skills')

async function closeElectronApp(app: Awaited<ReturnType<typeof electron.launch>>) {
  await Promise.race([
    app.close(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]).catch(() => {})
}

test('click sync CLI skills button recreates .codex/skills', async () => {
  test.setTimeout(180_000)

  const beforeCount = fs.existsSync(CODEX_SKILLS)
    ? fs.readdirSync(CODEX_SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0
  expect(beforeCount).toBe(0)

  const app = await electron.launch({ args: ['.'], cwd: ROOT })
  try {
    const page = await app.waitForEvent('window', { timeout: 60_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('[data-testid="chat-input"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.waitForTimeout(5000)

    await page.locator('[data-testid="settings-button"]').click()
    const syncBtn = page.getByRole('button', { name: /重新同步 CLI Skills|Sync CLI Skills/i })
    await expect(syncBtn).toBeVisible({ timeout: 15_000 })
    await syncBtn.click()

    await expect(async () => {
      if (!fs.existsSync(CODEX_SKILLS)) throw new Error('missing .codex/skills')
      const count = fs.readdirSync(CODEX_SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).length
      expect(count).toBe(14)
    }).toPass({ timeout: 60_000, intervals: [1000] })
  } finally {
    await closeElectronApp(app)
  }
})
