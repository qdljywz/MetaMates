import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  closeElectronApp,
  getElectronRoot,
  launchMetaMatesApp,
  resolveE2EWorkspacePath,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { pickContextMenuItem, rightClickTreeTitle } from '../helpers/contextMenu'

/**
 * Document-import extension install prompt when importing PDF without plugin.
 *
 * Run: npm run test:e2e:document-import-plugin
 */
const PDF_NAME = 'e2e-import-plugin-test.pdf'

test.describe.serial('@suite Document import extension', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = resolveE2EWorkspacePath()
  const pdfPath = path.join(workspace, PDF_NAME)

  test.beforeAll(() => {
    const fixture = path.join(getElectronRoot(), 'test-fixtures', 'sample.pdf')
    if (!fs.existsSync(fixture)) {
      throw new Error(`Missing fixture: ${fixture}`)
    }
    fs.mkdirSync(workspace, { recursive: true })
    fs.copyFileSync(fixture, pdfPath)
  })

  test.afterEach(async () => {
    if (app) await closeElectronApp(app)
  })

  test('prepareImport returns PLUGIN_NOT_INSTALLED without extension', async () => {
    test.setTimeout(180_000)

    app = await launchMetaMatesApp(undefined, { noDevPlugins: true })
    page = await resolveMainWindow(app)
    await waitForAppShell(page)

    const prepared = await page.evaluate(async (filePath) => {
      const plugin = await window.electronAPI?.plugins?.getDocumentImportStatus?.()
      const result = await window.electronAPI?.intelligence?.prepareImport?.(filePath)
      return {
        pluginInstalled: plugin?.installed === true,
        errorCode: result?.errorCode,
        pluginId: result?.pluginId,
        success: result?.success,
      }
    }, pdfPath)

    expect(prepared.pluginInstalled).toBe(false)
    expect(prepared.success).toBe(false)
    expect(prepared.errorCode).toBe('PLUGIN_NOT_INSTALLED')
    expect(prepared.pluginId).toBe('document-import')
  })

  test('file tree import shows extensions CTA without plugin', async () => {
    test.setTimeout(180_000)

    app = await launchMetaMatesApp(undefined, { noDevPlugins: true })
    page = await resolveMainWindow(app)
    await waitForAppShell(page)

    await page.locator('[data-testid="file-tree"]').getByRole('button', { name: /sync/i }).click().catch(() => {})
    await page.waitForTimeout(800)

    await rightClickTreeTitle(page, PDF_NAME)
    await pickContextMenuItem(page, /导入为情报|Import as intelligence/i)

    const notice = page.locator('.ant-message-notice').last()
    await expect(notice).toContainText(/文档导入|Document Import/i, { timeout: 15_000 })

    const installLink = notice.locator('button, a').filter({ hasText: /去安装|扩展|Extensions|Install/i })
    await expect(installLink.first()).toBeVisible({ timeout: 5_000 })
    await installLink.first().click()

    const pluginCard = page.locator('[data-testid="plugin-card-document-import"]')
    await expect(pluginCard).toBeVisible({ timeout: 10_000 })
    await expect(pluginCard).toContainText(/未安装|Not installed/i)
  })
})
