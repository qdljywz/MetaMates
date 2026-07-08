import fs from 'fs'
import path from 'path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
  warmUpAgentConnection,
  waitForAgentTurnIdle,
} from '../helpers/launchElectron'
import { E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON } from '../helpers/agentLiveMode'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import {
  closeAllEditorTabs,
  inboxMdCount,
  readInboxCountFromEmptyState,
  seedInboxNote,
  seedTodayPlanAllChecked,
  LOG_AND_PLAN_DIR,
} from '../helpers/inboxFixtures'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

function countNewMarkdownSince(workspace: string, dirs: string[], sinceMs: number): number {
  let count = 0
  for (const dir of dirs) {
    const absDir = path.join(workspace, dir)
    if (!fs.existsSync(absDir)) continue
    for (const name of fs.readdirSync(absDir)) {
      if (!name.toLowerCase().endsWith('.md')) continue
      const full = path.join(absDir, name)
      if (fs.statSync(full).mtimeMs >= sinceMs - 2_000) count += 1
    }
  }
  return count
}

/**
 * @suite Agent live — /graduate writeback + Inbox → processed + empty-state count
 * Requires CodeBuddy CLI. Run: npm run test:e2e:graduate-live
 */
test.describe.serial('@suite Agent /graduate live', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  let codebuddyAvailable = false
  let agentConnected = false
  let inboxName = ''
  let inboxRelPath = ''
  let inboxAbsPath = ''
  let beforeInboxCount = 0

  test.beforeAll(async () => {
    test.setTimeout(360_000)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)

    codebuddyAvailable =
      (await page.locator('[data-testid="agent-sidebar-codebuddy"]').count()) > 0 ||
      (await page.locator('[data-testid="switch-agent-codebuddy"]').count()) > 0

    if (E2E_AGENT_LIVE && codebuddyAvailable) {
      const warmup = await warmUpAgentConnection(page, { backend: 'codebuddy', workspace })
      agentConnected = warmup.ok
      if (!warmup.ok) {
        console.warn(`[E2E] CodeBuddy warmup failed (${warmup.reason}): ${warmup.detail}`)
      }
    }
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('/graduate promotes inbox note and archives source to processed @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!codebuddyAvailable || !agentConnected, 'CodeBuddy not connected')
    test.setTimeout(420_000)

    const marker = `GRADUATE_LIVE_${Date.now()}`
    inboxName = `_e2e_graduate_live_${Date.now()}.md`
    inboxRelPath = `${LOG_AND_PLAN_DIR}/Inbox/${inboxName}`.replace(/\\/g, '/')
    const body = `# ${inboxName}\n\n${marker}\n\n值得升级为永久笔记的 E2E 测试灵感。\n`

    await seedTodayPlanAllChecked(page, workspace)
    inboxAbsPath = await seedInboxNote(page, workspace, inboxName, body)
    expect(inboxAbsPath.length).toBeGreaterThan(0)

    beforeInboxCount = await inboxMdCount(page, workspace)

    await closeAllEditorTabs(page)
    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })
    await page.locator('.editor-empty-state__refresh').click()
    const baseEmptyCount = await readInboxCountFromEmptyState(empty)

    const turnStart = Date.now()
    await page.locator('[data-testid="slash-chip-graduate"]').click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/graduate', {
      timeout: 5_000,
    })

    const chatInput = page.locator('[data-testid="chat-input"]')
    await chatInput.fill(
      `请将 Inbox 中的 ${inboxName} 升级为一篇永久笔记，写入 ${WORKSPACE_LAYOUT.zh.INSIGHTS}/。` +
        `在回复中注明来源：${inboxRelPath}`,
    )
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 15_000 })
    await page.locator('[data-testid="send-button"]').click()

    await expect.poll(
      () =>
        countNewMarkdownSince(workspace, [WORKSPACE_LAYOUT.zh.INSIGHTS, PROJECTS_DIR], turnStart),
      { timeout: 300_000, intervals: [5_000] },
    ).toBeGreaterThan(0)

    await expect.poll(async () => inboxMdCount(page, workspace), {
      timeout: 120_000,
      intervals: [3_000],
    }).toBe(beforeInboxCount - 1)

    await expect
      .poll(
        async () =>
          page.evaluate(async (fp) => {
            const api = window.electronAPI
            if (!api?.fileExists) return false
            return !(await api.fileExists(fp)).exists
          }, inboxAbsPath),
        { timeout: 60_000 },
      )
      .toBe(true)

    await page.locator('.editor-empty-state__refresh').click()
    await expect.poll(async () => readInboxCountFromEmptyState(empty), {
      timeout: 30_000,
    }).toBe(Math.max(0, baseEmptyCount - 1))

    await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: false }).catch(() => {})
  })
})
