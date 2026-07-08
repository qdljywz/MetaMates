import { expect, type Locator, type Page } from '@playwright/test'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

export const LOG_AND_PLAN_DIR = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN
export const INSIGHTS_DIR = WORKSPACE_LAYOUT.zh.INSIGHTS

export async function seedInboxNote(
  page: Page,
  workspace: string,
  fileName: string,
  body?: string,
): Promise<string> {
  return page.evaluate(
    async ({ ws, dir, name, content }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.createDirectory || !api.writeFile) return ''
      const inboxDir = await api.path.join(ws, dir, 'Inbox')
      await api.createDirectory(inboxDir)
      const full = await api.path.join(inboxDir, name)
      await api.writeFile(full, content ?? `# ${name}\n\nseed\n`)
      return full
    },
    {
      ws: workspace,
      dir: LOG_AND_PLAN_DIR,
      name: fileName,
      content: body,
    },
  )
}

export async function inboxMdCount(page: Page, workspace: string): Promise<number> {
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

export async function seedTodayPlanAllChecked(page: Page, workspace: string): Promise<void> {
  await page.evaluate(
    async ({ ws, dir }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.writeFile) return
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      const planPath = await api.path.join(ws, dir, `${today} PLAN.md`)
      await api.writeFile(planPath, `# ${today} PLAN (E2E)\n\n- [x] 已完成\n`)
    },
    { ws: workspace, dir: LOG_AND_PLAN_DIR },
  )
}

export async function readInboxCountFromEmptyState(emptyStateLocator: Locator): Promise<number> {
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

export async function closeAllEditorTabs(page: Page): Promise<void> {
  const tabBar = page.locator('[data-testid="tab-bar"]')
  await expect(tabBar).toBeVisible({ timeout: 10_000 })
  const closeButtons = tabBar.locator('[data-testid="tab-close"]')
  while ((await closeButtons.count()) > 0) {
    await closeButtons.first().click()
    await page.waitForTimeout(100)
  }
}

export async function countInsightsNotesSince(
  page: Page,
  workspace: string,
  sinceMs: number,
): Promise<number> {
  return page.evaluate(
    async ({ ws, dir, since }) => {
      const api = window.electronAPI
      if (!api?.path?.join || !api.listFiles || !api.getFileStats) return 0
      const insightsDir = await api.path.join(ws, dir)
      const list = await api.listFiles(insightsDir, false)
      if (!list.success || !list.files) return 0
      let count = 0
      for (const file of list.files) {
        if (file.isDirectory || !file.name.toLowerCase().endsWith('.md')) continue
        const full = await api.path.join(insightsDir, file.name)
    const stats = await api.getFileStats(full)
    const modified = stats.success ? (stats.stats?.modified ?? stats.mtimeMs ?? 0) : 0
    if (modified > since) count += 1
      }
      return count
    },
    { ws: workspace, dir: INSIGHTS_DIR, since: sinceMs },
  )
}
