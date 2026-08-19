import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import {
  E2E_LINK_SEED_FILE,
  ensureE2ELinkSeed,
  getE2EWorkspace,
} from '../helpers/myM2Fixtures'

async function readSavedWorkspace(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const settings = await window.electronAPI?.getSettings()
    return settings?.workspacePath ?? null
  })
}

async function openSeedAndMarkDirty(page: Page, seedPath: string): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => typeof (window as any).__metamatesE2EDispatch === 'function'), {
      timeout: 30_000,
    })
    .toBe(true)

  await page.evaluate(() => window.__METAMATES_E2E__?.setAutoSave?.(false))
  await expect
    .poll(async () => {
      const settings = await page.evaluate(async () => window.electronAPI?.getSettings())
      return settings?.autoSave
    }, { timeout: 8_000 })
    .toBe(false)

  await page.evaluate(
    ({ filePath, name }) => {
      const dispatch = (window as { __metamatesE2EDispatch?: (action: unknown) => void }).__metamatesE2EDispatch
      dispatch?.({ type: 'ADD_TAB', payload: { path: filePath, name, isDirty: false } })
      dispatch?.({ type: 'SET_CURRENT_FILE', payload: filePath })
      dispatch?.({ type: 'UPDATE_TAB_DIRTY', payload: { path: filePath, isDirty: true } })
    },
    { filePath: seedPath, name: E2E_LINK_SEED_FILE },
  )
  await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.locator('.tab-bar__dirty-dot').first()).toBeVisible({ timeout: 8_000 })
}

function unsavedConfirmModal(page: Page) {
  return page.getByRole('dialog', { name: /未保存|unsaved/i })
}

/**
 * @suite Workspace switch — dirty tab blocks switch until user confirms discard
 * Prefer `npm run test:e2e:journey` (steps 30–31) for single-session regression.
 */
test.describe.serial('@suite Workspace dirty guard', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  let altWorkspace: string

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    altWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-e2e-alt-ws-'))
    ensureE2ELinkSeed(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })
    if (app) await closeElectronApp(app)
    try {
      fs.rmSync(altWorkspace, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  test('cancel keeps workspace when switching with dirty tab', async () => {
    const seedPath = ensureE2ELinkSeed(workspace)
    await openSeedAndMarkDirty(page, seedPath)

    await page.evaluate((alt) => {
      window.__METAMATES_E2E__?.clearSelectDirectoryQueue?.()
      window.__METAMATES_E2E__?.queueSelectDirectory?.({ canceled: false, filePaths: [alt] })
    }, altWorkspace)

    await page.click('[data-testid="activity-workspace"]')
    const modal = page.locator('.ant-modal-confirm, .metamates-unsaved-confirm').filter({
      hasText: /未保存|unsaved/i,
    })
    await expect(modal).toBeVisible({ timeout: 8_000 })
    await modal.getByRole('button', { name: /取\s*消|Cancel/i }).click()

    await expect.poll(async () => readSavedWorkspace(page)).toBe(workspace)
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible()
  })

  test('confirm discard switches workspace and clears dirty tab', async () => {
    await page.evaluate((alt) => {
      window.__METAMATES_E2E__?.clearSelectDirectoryQueue?.()
      window.__METAMATES_E2E__?.queueSelectDirectory?.({ canceled: false, filePaths: [alt] })
    }, altWorkspace)

    await page.click('[data-testid="activity-workspace"]')
    const modal = page.locator('.ant-modal-confirm, .metamates-unsaved-confirm').filter({
      hasText: /未保存|unsaved/i,
    })
    await expect(modal).toBeVisible({ timeout: 8_000 })
    await modal.getByRole('button', { name: /关闭不保存|close without saving/i }).click()

    await expect.poll(async () => readSavedWorkspace(page), { timeout: 30_000 }).toBe(altWorkspace)
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toHaveCount(0)

    await page.evaluate(() => window.__METAMATES_E2E__?.setAutoSave?.(true))

    await page.evaluate((ws) => {
      window.__METAMATES_E2E__?.clearSelectDirectoryQueue?.()
      window.__METAMATES_E2E__?.queueSelectDirectory?.({ canceled: false, filePaths: [ws] })
    }, workspace)
    await page.click('[data-testid="activity-workspace"]')
    await expect.poll(async () => readSavedWorkspace(page), { timeout: 30_000 }).toBe(workspace)
  })
})
