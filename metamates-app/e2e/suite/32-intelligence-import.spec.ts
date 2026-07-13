import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { contextMenuPickOnTreeTitle } from '../helpers/contextMenu'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const LOG_DIR = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN
const INTEL_DIR = WORKSPACE_LAYOUT.zh.INTELLIGENCE

async function seedInboxNote(page: Page, workspace: string, fileName: string, body: string): Promise<string> {
  return page.evaluate(
    async ({ ws, dir, name, content }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.createDirectory || !api.writeFile) return ''
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      await api.createDirectory(inboxDir)
      const full = await api.path.join(inboxDir, name)
      await api.writeFile(full, content)
      return full
    },
    { ws: workspace, dir: LOG_DIR, name: fileName, content: body },
  )
}

async function inboxMdCount(page: Page, workspace: string): Promise<number> {
  return page.evaluate(
    async ({ ws, dir }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.listFiles) return 0
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      const list = await api.listFiles(inboxDir, false)
      if (!list.success || !list.files) return 0
      return list.files.filter((f) => !f.isDirectory && f.name.toLowerCase().endsWith('.md')).length
    },
    { ws: workspace, dir: LOG_DIR },
  )
}

/**
 * Intelligence import — file tree vs /intel slash (agent-free paths).
 *
 * Run: npm run test:e2e:intelligence-import  (--dev Electron + Vite; not packaged exe)
 */
test.describe.serial('@suite Intelligence import', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('file tree import creates intelligence note and archives Inbox source', async () => {
    const nonce = `${Date.now()}`
    const inboxName = `_e2e_tree_intel_${nonce}.md`
    const body = `# Tree intel seed ${nonce}\n\nE2E clip for file-tree import.\n`
    const beforeCount = await inboxMdCount(page, workspace)
    const inboxAbs = await seedInboxNote(page, workspace, inboxName, body)
    expect(inboxAbs.length).toBeGreaterThan(0)

    await page.locator('[data-testid="file-tree"]').getByRole('button', { name: /sync/i }).click().catch(() => {})
    await page.waitForTimeout(800)
    await ensureFolderExpanded(page, LOG_DIR)
    await ensureFolderExpanded(page, 'Inbox')

    await contextMenuPickOnTreeTitle(
      page,
      inboxName,
      /导入为情报|Import as intelligence/i,
    )

    await expect(
      page.locator('.ant-message-notice').filter({ hasText: /已生成情报|Intelligence note created/i }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.locator('.ant-message-notice').filter({ hasText: /processed/i }),
    ).toBeVisible({ timeout: 10_000 })

    const intelNoteExists = await page.evaluate(
      async ({ ws, intelDir, nonce: n }) => {
        const api = window.electronAPI
        if (!api?.path?.join || !api.listFiles) return false
        const dir = await api.path.join(ws, intelDir)
        const list = await api.listFiles(dir, false)
        if (!list.success || !list.files) return false
        return list.files.some(
          (f) => !f.isDirectory && f.name.includes(n) && f.name.toLowerCase().endsWith('.md'),
        )
      },
      { ws: workspace, intelDir: INTEL_DIR, nonce },
    )
    expect(intelNoteExists).toBe(true)

    // File-tree import archives Inbox sources immediately (same as /intel local capture).
    await expect
      .poll(async () => inboxMdCount(page, workspace), { timeout: 15_000 })
      .toBe(beforeCount)
    await expect
      .poll(async () => page.evaluate(async (fp) => {
        const api = window.electronAPI
        if (!api?.fileExists) return true
        return !(await api.fileExists(fp)).exists
      }, inboxAbs), { timeout: 15_000 })
      .toBe(true)
  })

  test('inbox archive helper moves explicit inbox source to processed/', async () => {
    const nonce = `${Date.now()}`
    const inboxName = `_e2e_intel_archive_${nonce}.md`
    const beforeCount = await inboxMdCount(page, workspace)
    const inboxAbs = await seedInboxNote(
      page,
      workspace,
      inboxName,
      `# Intel archive seed ${nonce}\n`,
    )
    expect(inboxAbs.length).toBeGreaterThan(0)
    await expect.poll(async () => inboxMdCount(page, workspace), { timeout: 15_000 }).toBe(beforeCount + 1)

    const inboxCite = `${LOG_DIR}/Inbox/${inboxName}`.replace(/\\/g, '/')

    await expect
      .poll(async () => {
        const result = await page.evaluate(
          async ({ explicitPath }) => {
            const e2e = window.__METAMATES_E2E__
            if (!e2e?.simulateGraduateInboxArchive) {
              return { moved: [], skipped: ['no e2e bridge'] }
            }
            return e2e.simulateGraduateInboxArchive({ explicitPaths: [explicitPath] })
          },
          { explicitPath: inboxCite },
        )
        return result?.moved?.length ?? 0
      }, { timeout: 30_000 })
      .toBe(1)

    await expect.poll(async () => inboxMdCount(page, workspace), { timeout: 15_000 }).toBe(beforeCount)
    await expect
      .poll(
        async () =>
          page.evaluate(async (fp) => {
            const api = window.electronAPI
            if (!api?.fileExists) return false
            return !(await api.fileExists(fp)).exists
          }, inboxAbs),
        { timeout: 15_000 },
      )
      .toBe(true)
  })
})
