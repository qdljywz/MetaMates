import fs from 'fs'
import path from 'path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { getE2EWorkspace, removeE2EFile } from '../helpers/myM2Fixtures'
import { ensureTreeFileVisible, refreshFileTree } from '../helpers/treeActions'
import { vaultFileExists } from '../helpers/vaultAssert'
import { ensureVaultApiRunning, postVaultCapture } from '../helpers/vaultCapture'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const LOG_AND_PLAN = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN
const INBOX = WORKSPACE_LAYOUT.zh.INBOX

/**
 * @suite Vault API — POST /api/capture → Inbox on disk + file tree
 */
test.describe.serial('@suite Vault API capture', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  let captureAbsPath = ''
  let captureFileName = ''
  let vaultPort = 0

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
    vaultPort = await ensureVaultApiRunning(page, workspace)
  })

  test.afterAll(async () => {
    removeE2EFile(captureAbsPath)
    if (app) await closeElectronApp(app)
  })

  test('POST /api/capture writes markdown into Inbox', async () => {
    const marker = `E2E_VAULT_CAPTURE_${Date.now()}`
    const result = await postVaultCapture(page, vaultPort, {
      text: marker,
      title: 'E2E Capture',
      url: 'https://example.com/e2e',
    })

    expect(result.status).toBe(201)
    expect(result.data.success).toBe(true)
    expect(result.data.path).toContain('Inbox')
    expect(result.data.file).toBeTruthy()

    captureFileName = result.data.file!
    captureAbsPath = path.join(workspace, result.data.path!.replace(/\//g, path.sep))

    await expect.poll(() => vaultFileExists(captureAbsPath), { timeout: 15_000 }).toBe(true)
    const content = fs.readFileSync(captureAbsPath, 'utf8')
    expect(content).toContain(marker)
    expect(content).toContain('https://example.com/e2e')
  })

  test('file tree shows captured inbox note after refresh', async () => {
    test.skip(!captureFileName, 'capture file missing')

    await refreshFileTree(page)
    await ensureTreeFileVisible(page, captureFileName, [LOG_AND_PLAN, INBOX])
  })
})
