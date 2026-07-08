import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import {
  E2E_LINK_SEED_FILE,
  E2E_SANDBOX_DIR_NAME,
  ensureE2ELinkSeed,
  getE2EWorkspace,
} from '../helpers/myM2Fixtures'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { WORKSPACE_LAYOUT, getDailyPlanFileName, getTodayDateString } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS
const LOG_AND_PLAN_DIR = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN

async function seedInboxNote(page: Page, workspace: string, fileName: string): Promise<string> {
  return page.evaluate(
    async ({ ws, dir, name }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.createDirectory || !api.writeFile) return ''
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      await api.createDirectory(inboxDir)
      const full = await api.path.join(inboxDir, name)
      await api.writeFile(full, `# ${name}\n\nseed\n`)
      return full
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR, name: fileName },
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
    { ws: workspace, dir: LOG_AND_PLAN_DIR },
  )
}

async function openSandboxSeed(page: Page): Promise<void> {
  await ensureFolderExpanded(page, PROJECTS_DIR)
  await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
  await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
  await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * @suite Editor trust — graduate archive, dirty close, writeback tab, external delete
 */
test.describe.serial('@suite Editor trust', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const seedPath = ensureE2ELinkSeed(workspace)

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('graduate inbox archive moves cited inbox file to processed', async () => {
    const nonce = `${Date.now()}`
    const inboxName = `_e2e_graduate_${nonce}.md`
    const beforeCount = await inboxMdCount(page, workspace)
    const inboxAbs = await seedInboxNote(page, workspace, inboxName)
    expect(inboxAbs.length).toBeGreaterThan(0)
    const inboxCite = `${LOG_AND_PLAN_DIR}/Inbox/${inboxName}`.replace(/\\/g, '/')

    await expect.poll(async () => inboxMdCount(page, workspace), { timeout: 15_000 }).toBe(beforeCount + 1)

    await expect
      .poll(async () => {
        const result = await page.evaluate(
          async ({ sourceText, ws }) => {
            try {
              const { archiveGraduatedInboxNotes } = await import('/src/services/graduateInboxArchive.ts')
              return await archiveGraduatedInboxNotes({
                workspacePath: ws,
                language: 'zh',
                sourceTexts: [sourceText],
              })
            } catch (error) {
              return { moved: [], skipped: [String(error)] }
            }
          },
          { sourceText: `来源：${inboxCite}`, ws: workspace },
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
      )
      .toBe(true)
  })

  test('dirty tab close shows confirm and cancel keeps tab', async () => {
    await expect
      .poll(async () => page.evaluate(() => typeof (window as any).__metamatesE2EDispatch === 'function'), {
        timeout: 30_000,
      })
      .toBe(true)

    await page.evaluate(() => window.__METAMATES_E2E__?.setAutoSave?.(false))

    await openSandboxSeed(page)
    const marker = `E2E_DIRTY_${Date.now()}`
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(marker)
    await page.evaluate(
      ({ filePath }) => {
        const dispatch = (window as { __metamatesE2EDispatch?: (action: unknown) => void }).__metamatesE2EDispatch
        dispatch?.({ type: 'UPDATE_TAB_DIRTY', payload: { path: filePath, isDirty: true } })
      },
      { filePath: seedPath },
    )

    await page.locator('[data-testid="tab-close"]').first().click()
    const modal = page.getByRole('dialog', { name: /未保存|unsaved/i })
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await modal.getByRole('button', { name: /取\s*消|Cancel/i }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible()

    await page.locator('[data-testid="tab-close"]').first().click()
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: /关闭不保存|close without saving/i }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toHaveCount(0)

    await page.evaluate(() => window.__METAMATES_E2E__?.setAutoSave?.(true))
  })

  test('slash writeback opens today plan in editor when file exists', async () => {
    await expect
      .poll(async () => page.evaluate(() => typeof (window as any).__metamatesE2EDispatch === 'function'), {
        timeout: 30_000,
      })
      .toBe(true)

    const today = getTodayDateString('Asia/Shanghai')
    const planName = getDailyPlanFileName(today)
    const planRel = `${LOG_AND_PLAN_DIR}/${planName}`

    await page.evaluate(
      async ({ ws, rel, day }) => {
        const api = window.electronAPI
        if (!api?.path?.join || !api.writeFile) return
        const planPath = await api.path.join(ws, rel)
        await api.writeFile(planPath, `# ${day} PLAN (E2E trust)\n\n- [ ] E2E item\n`)
      },
      { ws: workspace, rel: planRel, day: today },
    )

    const opened = await page.evaluate(
      async ({ ws, cmd }) => {
        const { openSlashWritebackInEditor } = await import('/src/utils/openSlashWriteback.ts')
        const dispatch = (window as { __metamatesE2EDispatch?: (action: unknown) => void }).__metamatesE2EDispatch
        if (!dispatch) return null
        return openSlashWritebackInEditor({
          cmdId: cmd,
          workspacePath: ws,
          language: 'zh',
          dispatch: dispatch as never,
        })
      },
      { ws: workspace, cmd: '/today' },
    )
    expect(opened).toBeTruthy()

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planName })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('external file delete closes ghost editor tab', async () => {
    await expect
      .poll(async () => page.evaluate(() => typeof (window as any).__metamatesE2EDispatch === 'function'), {
        timeout: 30_000,
      })
      .toBe(true)

    const nonce = `${Date.now()}`
    const tempName = `_e2e_external_${nonce}.md`
    const tempRel = path.join(
      workspace,
      PROJECTS_DIR,
      E2E_SANDBOX_DIR_NAME,
      tempName,
    )
    fs.mkdirSync(path.dirname(tempRel), { recursive: true })
    fs.writeFileSync(tempRel, '# external delete e2e\n', 'utf8')

    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: tempName }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: tempName })).toBeVisible({
      timeout: 15_000,
    })

    try {
      fs.unlinkSync(tempRel)
    } catch {
      // ignore
    }

    await page.evaluate(async (fp) => {
      const dispatch = (window as { __metamatesE2EDispatch?: (action: unknown) => void }).__metamatesE2EDispatch
      const { workspaceIndexService } = await import('/src/services/workspaceIndex.ts')
      const { pruneMissingOpenTabs } = await import('/src/utils/openSlashWriteback.ts')
      const ws = (window as { __METAMATES_E2E__?: { workspace?: string } }).__METAMATES_E2E__?.workspace || ''
      await workspaceIndexService.signalVaultTreeChange(fp)
      if (dispatch && ws) {
        await pruneMissingOpenTabs({ workspacePath: ws, tabPaths: [fp], dispatch: dispatch as never })
      }
    }, tempRel)

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: tempName })).toHaveCount(0, {
      timeout: 15_000,
    })

    const diskContent = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, 'utf8') : ''
    expect(diskContent.length).toBeGreaterThan(0)
  })
})
