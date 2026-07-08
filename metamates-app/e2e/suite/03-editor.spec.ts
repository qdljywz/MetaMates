import { test, expect, type ElectronApplication, type Page, type Locator } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  warmUpAgentConnection,
  waitForAppShell,
  waitForAgentSlashReady,
} from '../helpers/launchElectron'
import {
  E2E_LINK_SEED_FILE,
  E2E_SANDBOX_DIR_NAME,
  ensureE2ELinkSeed,
  getE2EWorkspace,
} from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS
const LOG_AND_PLAN_DIR = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN

/**
 * @description Create inbox markdown notes inside Electron runtime.
 */
async function seedInboxNotes(page: Page, workspace: string, names: string[]): Promise<void> {
  await page.evaluate(
    async ({ ws, dir, fileNames }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.createDirectory || !api.writeFile) return
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      await api.createDirectory(inboxDir)
      for (const fileName of fileNames) {
        const full = await api.path.join(inboxDir, fileName)
        await api.writeFile(full, `# ${fileName}\n\nseed\n`)
      }
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR, fileNames: names },
  )
}

/**
 * @description Move one inbox note into Inbox/processed using Electron API.
 */
async function archiveInboxNote(page: Page, workspace: string, fileName: string): Promise<void> {
  await page.evaluate(
    async ({ ws, dir, name }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.createDirectory || !api.renameFile) return
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      const processedDir = await api.path.join(inboxDir, 'processed')
      await api.createDirectory(processedDir)
      const source = await api.path.join(inboxDir, name)
      const target = await api.path.join(processedDir, `${Date.now()}-${name}`)
      await api.renameFile(source, target)
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR, name: fileName },
  )
}

/**
 * @description Parse inbox count from empty-state visible text (context line or question).
 */
async function readInboxCountFromEmptyState(emptyStateLocator: Locator): Promise<number> {
  const text = (await emptyStateLocator.innerText()).replace(/\s+/g, ' ')
  const patterns = [
    /收件箱\s*(\d+)\s*条待整理/,
    /收件箱(?:里)?有?\s*(\d+)\s*条/,
    /有\s*(\d+)\s*条\s*Inbox/i,
    /(\d+)\s*条(?:碎片|Inbox|inbox)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return Number.parseInt(match[1], 10)
  }
  return 0
}

async function readInboxCountFromVault(page: Page, workspace: string): Promise<number> {
  return page.evaluate(
    async ({ ws, dir }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.listFiles) return 0
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      const list = await api.listFiles(inboxDir, false)
      if (!list.success || !list.files) return 0
      return list.files.filter(
        (f) => !f.isDirectory && f.name.toLowerCase().endsWith('.md'),
      ).length
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR },
  )
}

/** Today PLAN with no open checkboxes — keeps inbox visible in empty-state when backlog exists. */
async function seedTodayPlanAllChecked(page: Page, workspace: string): Promise<void> {
  await page.evaluate(
    async ({ ws, dir }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.writeFile) return
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      const planPath = await api.path.join(ws, dir, `${today} PLAN.md`)
      await api.writeFile(planPath, `# ${today} PLAN (E2E inbox test)\n\n- [x] 已完成\n`)
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR },
  )
}

/** Close every open editor tab so empty-state is visible. */
async function closeAllEditorTabs(page: Page): Promise<void> {
  const tabBar = page.locator('[data-testid="tab-bar"]')
  await expect(tabBar).toBeVisible({ timeout: 10_000 })
  const closeButtons = tabBar.locator('.tab-close')
  while ((await closeButtons.count()) > 0) {
    await closeButtons.first().click()
    await page.waitForTimeout(100)
  }
}

/** Drop cached empty-state for workspace so the next refresh rebuilds from vault context. */
async function clearEmptyStateCache(page: Page, workspace: string): Promise<void> {
  await page.evaluate((ws) => {
    const key = ws.replace(/\\/g, '/').toLowerCase()
    const raw = localStorage.getItem('metamates-empty-state-v1')
    if (!raw) return
    const store = JSON.parse(raw) as Record<string, unknown>
    delete store[key]
    localStorage.setItem('metamates-empty-state-v1', JSON.stringify(store))
  }, workspace)
}

/**
 * @description Write today's PLAN with a unique open task for plan-focused empty-state tests.
 */
async function seedTodayPlanWithOpenTask(
  page: Page,
  workspace: string,
  openTaskLabel: string,
): Promise<void> {
  await page.evaluate(
    async ({ ws, dir, task }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.writeFile) return
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      const planPath = await api.path.join(ws, dir, `${today} PLAN.md`)
      const body = `# ${today} PLAN (E2E)

- [x] 已完成占位
- [ ] ${task}
- [ ] 另一项待办
`
      await api.writeFile(planPath, body)
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR, task: openTaskLabel },
  )
}

/**
 * @description Click「换一个问题」until the headline changes (max attempts).
 */
async function refreshUntilQuestionChanges(
  page: Page,
  question: Locator,
  beforeText: string,
  maxAttempts = 4,
): Promise<string> {
  let lastText = beforeText
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.locator('.editor-empty-state__refresh').click()
    try {
      await expect
        .poll(async () => await question.innerText(), { timeout: 15_000 })
        .not.toBe(lastText)
      return await question.innerText()
    } catch {
      lastText = await question.innerText()
    }
  }
  throw new Error('empty-state question did not change after manual refresh')
}

/**
 * @suite Editor, tabs, wiki link picker (UX-10, UX-11)
 */
test.describe.serial('@suite Editor & tabs', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    const workspace = getE2EWorkspace()
    ensureE2ELinkSeed(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('opens a markdown file from the tree into a tab', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('.cm-content')).toBeVisible()
  })

  test('wiki link picker hides CLI skill files', async () => {
    await page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await page.locator('.cm-content').click()
    await page.getByRole('button', { name: '[[ ]]' }).click()

    const modal = page.locator('.ant-modal').filter({
      hasText: /选择或创建链接目标|Select or create link target/i,
    })
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await expect(modal.locator('.ant-list-item').filter({ hasText: 'challenge' })).toHaveCount(0)
    await expect(modal.locator('.ant-list-item').filter({ hasText: 'e2e-link-seed' })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden({ timeout: 5_000 })
  })

  test('closing the last tab shows the engine-first empty state', async () => {
    await closeTabByName(page, E2E_LINK_SEED_FILE)
    await expect(page.locator('[data-testid="tab-bar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tab-bar--empty')).toBeVisible({ timeout: 10_000 })
    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 10_000 })
    await expect(empty).toContainText(/思考引擎|Thinking engine/i)
    await expect(page.locator('[data-testid="editor-empty-state-question"]')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('empty-state inbox count updates after inbox item archived', async () => {
    await closeAllEditorTabs(page)

    const workspace = getE2EWorkspace()
    await seedTodayPlanAllChecked(page, workspace)
    await clearEmptyStateCache(page, workspace)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('metamates:empty-state-updated')))

    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 10_000 })

    await expect
      .poll(async () => readInboxCountFromEmptyState(empty), { timeout: 30_000 })
      .toBeGreaterThan(0)
    const baseCount = await readInboxCountFromEmptyState(empty)

    const nonce = `${Date.now()}`
    const inboxA = `_e2e_inbox_a_${nonce}.md`
    const inboxB = `_e2e_inbox_b_${nonce}.md`
    await seedInboxNotes(page, workspace, [inboxA, inboxB])
    await page.locator('.editor-empty-state__refresh').click()
    await expect.poll(async () => readInboxCountFromEmptyState(empty), {
      timeout: 30_000,
    }).toBe(baseCount + 2)

    await archiveInboxNote(page, workspace, inboxA)
    await page.locator('.editor-empty-state__refresh').click()
    await expect.poll(async () => readInboxCountFromEmptyState(empty), {
      timeout: 30_000,
    }).toBe(baseCount + 1)
  })

  test('empty-state locally rephrases after stale cache while keeping agent connected', async () => {
    await closeAllEditorTabs(page)

    const workspace = getE2EWorkspace()
    const warmup = await warmUpAgentConnection(page, { backend: 'codebuddy', workspace, maxMs: 120_000 })
    test.skip(!warmup.ok, `Agent warmup unavailable: ${warmup.detail}`)

    const empty = page.locator('[data-testid="editor-empty-state"]')
    const question = page.locator('[data-testid="editor-empty-state-question"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })
    await expect(waitForAgentSlashReady(page, 30_000)).resolves.toBe(true)

    const beforeText = await question.innerText()

    await page.evaluate(async (ws) => {
      const key = ws.replace(/\\/g, '/').toLowerCase()
      const raw = localStorage.getItem('metamates-empty-state-v1')
      if (!raw) throw new Error('missing empty-state store')
      const store = JSON.parse(raw) as Record<string, any>
      const entry = store[key]
      if (!entry) throw new Error('missing workspace cache entry')
      entry.generatedAt = Date.now() - 11 * 60 * 1000
      store[key] = entry
      localStorage.setItem('metamates-empty-state-v1', JSON.stringify(store))
      window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
    }, workspace)

    await expect
      .poll(async () => await question.innerText(), { timeout: 30_000 })
      .not.toBe(beforeText)

    await expect(waitForAgentSlashReady(page, 15_000)).resolves.toBe(true)
  })

  test('empty-state full rethink uses background agent on significant change', async () => {
    test.setTimeout(180_000)
    await closeAllEditorTabs(page)

    const workspace = getE2EWorkspace()
    const warmup = await warmUpAgentConnection(page, { backend: 'codebuddy', workspace, maxMs: 120_000 })
    test.skip(!warmup.ok, `Agent warmup unavailable: ${warmup.detail}`)

    await expect(waitForAgentSlashReady(page, 30_000)).resolves.toBe(true)

    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })
    const question = page.locator('[data-testid="editor-empty-state-question"]')
    const beforeQuestion = await question.innerText()

    await page.evaluate(async ({ ws, dir }) => {
      localStorage.removeItem('metamates-empty-state-rethink-debug')
      const api = window.electronAPI
      if (!api?.path?.join || !api.writeFile || !api.createDirectory) return
      const key = ws.replace(/\\/g, '/').toLowerCase()
      const raw = localStorage.getItem('metamates-empty-state-v1')
      if (raw) {
        const store = JSON.parse(raw) as Record<string, any>
        if (store[key]) {
          store[key].significantFingerprint = '__force-full-rethink__'
          localStorage.setItem('metamates-empty-state-v1', JSON.stringify(store))
        }
      }
      const markerDir = await api.path.join(ws, dir, 'Inbox')
      await api.createDirectory(markerDir)
      const markerPath = await api.path.join(markerDir, `_e2e_rethink_${Date.now()}.md`)
      await api.writeFile(markerPath, '# e2e rethink marker')
      window.dispatchEvent(new CustomEvent('metamates:empty-state-force-refresh'))
    }, { ws: workspace, dir: LOG_AND_PLAN_DIR })

    await expect.poll(async () => {
      return await page.evaluate(({ ws, before }) => {
        const debug = localStorage.getItem('metamates-empty-state-rethink-debug') || ''
        if (/^ok:/.test(debug)) return 'ok-debug'
        const key = ws.replace(/\\/g, '/').toLowerCase()
        const raw = localStorage.getItem('metamates-empty-state-v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          const entry = store[key]
          const qt = entry?.questionText?.trim()
          if (qt && qt !== before) return 'ok-cache'
        }
        const ui = document.querySelector('[data-testid="editor-empty-state-question"]')?.textContent?.trim() || ''
        if (ui && ui !== before) return 'ok-ui'
        return debug || 'pending'
      }, { ws: workspace, before: beforeQuestion })
    }, { timeout: 150_000 }).toMatch(/^ok-/)

    await expect
      .poll(async () => await question.innerText(), {
        timeout: 30_000,
      })
      .not.toBe(beforeQuestion)
    await expect(waitForAgentSlashReady(page, 20_000)).resolves.toBe(true)
  })

  test('empty-state manual refresh changes question text', async () => {
    await closeAllEditorTabs(page)

    const empty = page.locator('[data-testid="editor-empty-state"]')
    const question = page.locator('[data-testid="editor-empty-state-question"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })

    const beforeText = await question.innerText()
    const afterText = await refreshUntilQuestionChanges(page, question, beforeText)
    expect(afterText.trim().length).toBeGreaterThan(0)
    expect(afterText).not.toBe(beforeText)
  })

  test('empty-state prefers plan open task over inbox backlog', async () => {
    await closeAllEditorTabs(page)

    const workspace = getE2EWorkspace()
    const taskMarker = `E2E焦点任务_${Date.now()}`
    await seedTodayPlanWithOpenTask(page, workspace, taskMarker)
    await clearEmptyStateCache(page, workspace)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
    })

    const question = page.locator('[data-testid="editor-empty-state-question"]')
    await expect
      .poll(async () => await question.innerText(), { timeout: 30_000 })
      .toContain(taskMarker)
  })
})
