import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const INSIGHTS_DIR = WORKSPACE_LAYOUT.zh.INSIGHTS
const LOG_AND_PLAN_DIR = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN

const BULLET_ALPHA = 'E2E preview bullet alpha'
const BULLET_BETA = 'E2E preview bullet beta'

async function closeAllEditorTabs(page: Page): Promise<void> {
  const tabBar = page.locator('[data-testid="tab-bar"]')
  await expect(tabBar).toBeVisible({ timeout: 10_000 })
  const closeButtons = tabBar.locator('.tab-close')
  while ((await closeButtons.count()) > 0) {
    await closeButtons.first().click()
    await page.waitForTimeout(100)
  }
}

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

async function seedTodayPlanAllChecked(page: Page, workspace: string): Promise<void> {
  await page.evaluate(
    async ({ ws, dir }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.writeFile) return
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      const planPath = await api.path.join(ws, dir, `${today} PLAN.md`)
      await api.writeFile(planPath, `# ${today} PLAN (E2E preview test)\n\n- [x] 已完成\n`)
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR },
  )
}

async function seedIdeasReport(
  page: Page,
  workspace: string,
  fileName: string,
  body: string,
): Promise<string> {
  return page.evaluate(
    async ({ ws, insightsDir, fileName, body }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.createDirectory || !api.writeFile) {
        throw new Error('electronAPI unavailable for seeding ideas report')
      }
      const dir = await api.path.join(ws, insightsDir)
      await api.createDirectory(dir)
      const fullPath = await api.path.join(dir, fileName)
      await api.writeFile(fullPath, body)
      return fullPath
    },
    { ws: workspace, insightsDir: INSIGHTS_DIR, fileName, body },
  )
}

async function removeIdeasReport(page: Page, filePath: string): Promise<void> {
  await page.evaluate(async (target) => {
    const api = window.electronAPI
    if (!api?.deleteFile) return
    await api.deleteFile(target).catch(() => {})
  }, filePath)
}

/** Pin empty-state to ideas-brewing so hover preview targets the seeded report. */
async function forceIdeasBrewingQuestion(
  page: Page,
  workspace: string,
  reportLabel: string,
): Promise<void> {
  await page.evaluate(
    ({ ws, reportLabel }) => {
      const key = ws.replace(/\\/g, '/').toLowerCase()
      const raw = localStorage.getItem('metamates-empty-state-v1')
      const store = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      const existing = (store[key] as Record<string, unknown> | undefined) ?? {}
      store[key] = {
        ...existing,
        workspacePath: ws,
        generatedAt: Date.now(),
        questionId: 'ideas-brewing',
        questionKey: 'emptyState.questions.ideasBrewing',
        questionParams: { report: reportLabel },
        contextLineKey: 'emptyState.contextLine.ideas',
        contextLineParams: { report: reportLabel },
        history: [],
      }
      localStorage.setItem('metamates-empty-state-v1', JSON.stringify(store))
      window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
    },
    { ws: workspace, reportLabel },
  )
}

/**
 * @suite Empty-state hover preview (ideas report bullets in popover)
 * Failure mode: popover shows only metadata headings, not bullet content.
 */
test.describe.serial('@suite Empty-state hover preview', () => {
  let app: ElectronApplication
  let page: Page
  let ideasReportPath: string
  let reportLabel: string

  test.beforeAll(async () => {
    const workspace = getE2EWorkspace()
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    reportLabel = `Ideas_Report_${today}`
    const fileName = `${reportLabel}.md`

    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)

    await seedTodayPlanAllChecked(page, workspace)
    ideasReportPath = await seedIdeasReport(
      page,
      workspace,
      fileName,
      `# ${reportLabel}

## 💡 点子报告

- ${BULLET_ALPHA}
- ${BULLET_BETA}
`,
    )
  })

  test.afterAll(async () => {
    if (ideasReportPath) {
      await removeIdeasReport(page, ideasReportPath).catch(() => {})
    }
    if (app) await closeElectronApp(app)
  })

  test('ideas report hover preview lists bullet content, not only headings', async () => {
    const workspace = getE2EWorkspace()
    await closeAllEditorTabs(page)
    await clearEmptyStateCache(page, workspace)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
    })

    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="editor-empty-state-question"]')).toBeVisible({
      timeout: 15_000,
    })

    await forceIdeasBrewingQuestion(page, workspace, reportLabel)

    const hoverable = page.locator('.editor-empty-state__context-line--hoverable')
    await expect(hoverable).toBeVisible({ timeout: 15_000 })
    await expect(hoverable).toContainText(reportLabel)

    await hoverable.hover()
    const popover = page.locator('.editor-empty-state__context-file-popover')
    await expect(popover).toBeVisible({ timeout: 5_000 })

    const list = popover.locator('.editor-empty-state__context-file-preview-list li')
    await expect(list).toHaveCount(2, { timeout: 5_000 })
    await expect(list.filter({ hasText: BULLET_ALPHA })).toBeVisible()
    await expect(list.filter({ hasText: BULLET_BETA })).toBeVisible()

    const popoverText = (await popover.innerText()).replace(/\s+/g, ' ')
    expect(popoverText).not.toMatch(/💡\s*点子报告.*💡\s*点子报告/)
    expect(popoverText).not.toMatch(/点子报告.*点子报告.*点子报告/)

    const summaryLine = popover.locator('.editor-empty-state__context-file-preview-summary')
    if (await summaryLine.count()) {
      await expect(summaryLine).not.toHaveText(/^💡\s*点子报告$/i)
    }
  })
})
