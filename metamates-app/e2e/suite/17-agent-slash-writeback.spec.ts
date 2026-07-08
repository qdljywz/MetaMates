import fs from 'fs'
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
import { closeTabByName } from '../helpers/assertions'
import { readVaultFileUtf8 } from '../helpers/vaultAssert'
import {
  getDailyPlanFileName,
  getDailyPlanPath,
  getTodayDateString,
  resolveUserTimezone,
} from '../../src/constants/paths'

/**
 * @suite Agent live — CodeBuddy /today writeback → PLAN on disk + editor tab
 * Requires CodeBuddy CLI. Run: npm run test:e2e:agent-writeback
 */
test.describe.serial('@suite Agent slash writeback (live)', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const today = getTodayDateString(resolveUserTimezone('Asia/Shanghai'))
  const planFileName = getDailyPlanFileName(today)
  const planPath = getDailyPlanPath(workspace, today, 'zh')

  let codebuddyAvailable = false
  let agentConnected = false

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

  test('/today writeback updates PLAN on disk and opens editor tab @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!codebuddyAvailable || !agentConnected, 'CodeBuddy not connected')
    test.setTimeout(300_000)

    const beforeMtime = fs.existsSync(planPath) ? fs.statSync(planPath).mtimeMs : 0
    const beforeContent = fs.existsSync(planPath) ? readVaultFileUtf8(planPath) : ''

    await page.locator('[data-testid="slash-chip-today"]').click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/today', { timeout: 5_000 })
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 15_000 })
    await page.locator('[data-testid="send-button"]').click()

    await expect.poll(() => {
      if (!fs.existsSync(planPath)) return false
      const mtime = fs.statSync(planPath).mtimeMs
      const content = readVaultFileUtf8(planPath)
      return mtime > beforeMtime || content.length > beforeContent.length + 30
    }, { timeout: 240_000, intervals: [3_000] }).toBe(true)

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName })).toBeVisible({
      timeout: 30_000,
    })

    await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled({ timeout: 120_000 })
    await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: false }).catch(() => {})

    await closeTabByName(page, planFileName)
  })
})
