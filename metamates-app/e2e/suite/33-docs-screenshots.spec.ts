/**
 * README screenshots — development Electron, Chinese + English UI.
 * Run: npm run docs:screenshots
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  dismissBlockingModals,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { closeAllTabs } from '../helpers/assertions'
import { ensureTreeFileVisible, openFileFromTree, refreshFileTree } from '../helpers/treeActions'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'docs', 'screenshots')

type Locale = 'zh' | 'en'

function prepareDocsWorkspace(locale: Locale): string {
  // Basename is shown in the vault chrome — keep a product-like name.
  const dest = path.join(ROOT, 'e2e', '.workspace', `docs-${locale}`, 'MetaMates')
  const src = path.join(ROOT, 'inits', locale)
  fs.rmSync(path.dirname(dest), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
  return dest
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true })
  const dest = path.join(OUT, name)
  await page.screenshot({ path: dest, type: 'png' })
  console.log(`[docs:screenshots] wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`)
}

async function waitShellReady(page: Page): Promise<void> {
  await page
    .locator('[data-testid="agent-connecting-skeleton"]')
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => {})
  await page
    .locator('[data-testid="chat-input"], [data-testid="editor-empty-state"], .cm-editor')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await expect(page.getByText(/E2E副脑|E2E 副脑/)).toHaveCount(0)
}

async function captureLocale(locale: Locale): Promise<void> {
  const workspace = prepareDocsWorkspace(locale)
  const app = await launchMetaMatesApp(workspace, {
    engineDisplayName: locale === 'zh' ? '副脑' : 'Partner',
    language: locale,
    freshUserData: true,
  })
  const page = await resolveMainWindow(app, { requireChatInput: false })
  await waitForAppShell(page)
  await dismissBlockingModals(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitShellReady(page)

  // Some runs create bilingual folder aliases; for EN README shots keep English tree only.
  if (locale === 'en') {
    for (const name of fs.readdirSync(workspace)) {
      if (/[\u4e00-\u9fff]/.test(name)) {
        fs.rmSync(path.join(workspace, name), { recursive: true, force: true })
      }
    }
    await refreshFileTree(page)
  }

  await closeAllTabs(page)
  await expect(page.locator('[data-testid="tab-bar"] > div')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('[data-testid="editor-empty-state"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/e2e-packaged-import-probe|E2E副脑/i)).toHaveCount(0)
  await page.waitForTimeout(500)
  await shot(page, `empty-state.${locale}.png`)

  await refreshFileTree(page)
  await ensureTreeFileVisible(page, 'README.md', [])
  await openFileFromTree(page, 'README')
  await expect(page.locator('[data-testid="tab-bar"] > div').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-testid="editor-empty-state"]')).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(500)
  await shot(page, `main-ui.${locale}.png`)

  await page.keyboard.press('Escape')
  await page.locator('[data-testid="settings-button"]').click()
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('tab', { name: /AI 助手|AI assistants/i }).click({ force: true })
  await page.locator('[data-testid="settings-agent-tab"]').waitFor({ state: 'visible', timeout: 10_000 })
  const docCard = page.locator('[data-testid="plugin-card-document-import"]')
  await docCard.scrollIntoViewIfNeeded()
  await expect(docCard).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(400)
  await shot(page, `plugins-settings.${locale}.png`)

  if (locale === 'zh') {
    for (const base of ['empty-state', 'main-ui', 'plugins-settings'] as const) {
      fs.copyFileSync(path.join(OUT, `${base}.zh.png`), path.join(OUT, `${base}.png`))
    }
  }

  await closeElectronApp(app)
}

test.describe.serial('@suite README screenshots zh+en', () => {
  test('01 Chinese UI', async () => {
    test.setTimeout(120_000)
    await captureLocale('zh')
  })

  test('02 English UI', async () => {
    test.setTimeout(120_000)
    await captureLocale('en')
  })
})
