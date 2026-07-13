/**
 * Packaged functional smoke: bundled plugin auto-install → PDF import + Whisper available.
 *
 * Run: npm run test:e2e:packaged:plugins
 */
import fs from 'fs'
import path from 'path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  getElectronRoot,
  launchMetaMatesApp,
  resolveMainWindow,
  resolvePackagedExe,
  waitForAppShell,
} from '../helpers/launchElectron'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'

const PDF_NAME = 'e2e-packaged-import-probe.pdf'

test.describe.serial('@suite Packaged plugins functional', () => {
  test.describe.configure({ timeout: 480_000 })
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const pdfPath = path.join(workspace, PDF_NAME)

  test.beforeAll(async () => {
    test.setTimeout(480_000)
    const exe = resolvePackagedExe()
    test.skip(!exe, 'Packaged MetaMates.exe missing')

    const fixture = path.join(getElectronRoot(), 'test-fixtures', 'sample.pdf')
    if (!fs.existsSync(fixture)) throw new Error(`Missing fixture: ${fixture}`)
    fs.mkdirSync(workspace, { recursive: true })
    fs.copyFileSync(fixture, pdfPath)

    app = await launchMetaMatesApp(workspace, { freshUserData: true })
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('01 bundled document-import auto-installs', async () => {
    test.setTimeout(360_000)
    await expect.poll(async () => {
      const status = await page.evaluate(async () => {
        const plugin = await window.electronAPI?.plugins?.getDocumentImportStatus?.()
        return plugin?.installed === true
      })
      return status
    }, { timeout: 300_000, intervals: [5_000] }).toBe(true)
  })

  test('02 PDF intelligence import succeeds after plugin install', async () => {
    test.setTimeout(120_000)
    const result = await page.evaluate(async (filePath) => {
      const prepared = await window.electronAPI?.intelligence?.prepareImport?.(filePath)
      return {
        success: prepared?.success === true,
        textLen: prepared?.text?.length ?? 0,
        errorCode: prepared?.errorCode,
      }
    }, pdfPath)

    expect(result.success, `prepareImport failed: ${result.errorCode ?? 'unknown'}`).toBe(true)
    expect(result.textLen).toBeGreaterThan(10)
  })

  test('03 bundled offline-speech enables Whisper engine', async () => {
    test.setTimeout(360_000)
    await expect.poll(async () => {
      const runtime = await page.evaluate(async () => {
        const plugin = await window.electronAPI?.plugins?.getOfflineSpeechStatus?.()
        const speech = await window.electronAPI?.speech?.isAvailable?.()
        return {
          pluginInstalled: plugin?.installed === true,
          whisper: speech?.whisper === true,
        }
      })
      return runtime.pluginInstalled && runtime.whisper
    }, { timeout: 300_000, intervals: [5_000] }).toBe(true)
  })

  test('04 whisper speech start/stop lifecycle', async () => {
    test.setTimeout(60_000)
    const lifecycle = await page.evaluate(async () => {
      const api = window.electronAPI?.speech
      if (!api?.start || !api?.stop) return { ok: false, reason: 'missing-api' }
      const start = await api.start('zh-CN')
      if (start?.success === false) return { ok: false, reason: start?.error ?? 'start-failed' }
      await new Promise((r) => setTimeout(r, 800))
      const stop = await api.stop()
      return { ok: stop?.success !== false, reason: stop?.error }
    })
    expect(lifecycle.ok, lifecycle.reason ?? 'speech lifecycle failed').toBe(true)
  })
})
