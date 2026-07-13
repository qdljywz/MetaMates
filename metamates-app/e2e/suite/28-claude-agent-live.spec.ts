/**
 * Claude agent-live E2E — real ACP session + LLM prompts (consumes quota).
 *
 * Requires: Claude CLI installed, authenticated, enabled in MetaMates.
 *
 * Run once: npm run test:e2e:claude-agent-live
 * Vault write (slow): npm run test:e2e:claude-agent-write
 * Full /today slash (slow): npm run test:e2e:claude-agent-writeback
 */
import fs from 'fs'
import path from 'path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
  waitForAgentSlashReady,
  waitForAgentTurnIdle,
} from '../helpers/launchElectron'
import { E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON } from '../helpers/agentLiveMode'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeTabByName } from '../helpers/assertions'
import { readVaultFileUtf8 } from '../helpers/vaultAssert'
import {
  CLAUDE_BACKEND,
  approveAcpPermissionIfVisible,
  buildPlanPathCandidates,
  detectPlanWrite,
  ensureAgentYoloMode,
  expectNoRethinkJsonInVisibleAgentReplies,
  getEffectiveTodayFromApp,
  isClaudeAgentAvailable,
  messageListShowsWritebackVerified,
  scanWorkspaceForMarker,
  sendAgentPingAndExpectMarker,
  warmupClaudeAgent,
} from '../helpers/agentLiveClaude'
import { fetchAgentRuntime } from '../helpers/agentRecent'
import { waitForConnectionStatus } from '../helpers/agentSettings'
import { getDailyPlanFileName } from '../../src/constants/paths'

test.describe.serial('@suite Claude agent live (real prompts)', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  let claudeAvailable = false
  let claudeConnected = false
  let warmupDetail = ''

  test.beforeAll(async () => {
    test.setTimeout(420_000)
    process.env.E2E_AGENT_BACKEND = CLAUDE_BACKEND
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)

    claudeAvailable = await isClaudeAgentAvailable(page)
    if (!claudeAvailable) {
      console.warn('[E2E] Claude not in agent toolbar — live tests will skip')
      return
    }

    if (!E2E_AGENT_LIVE) {
      console.log('[E2E] E2E_AGENT_LIVE not set — connection-only checks still run; prompt tests skip')
      return
    }

    const warmup = await warmupClaudeAgent(page, workspace, 180_000)
    claudeConnected = warmup.ok
    warmupDetail = `${warmup.reason}: ${warmup.detail}`
    if (!warmup.ok) {
      console.warn(`[E2E] Claude warmup failed (${warmupDetail})`)
    }
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('01 Claude runtime IPC reports installed CLI', async () => {
    test.skip(!claudeAvailable, 'Claude not in agent toolbar')
    const runtime = await fetchAgentRuntime(page, CLAUDE_BACKEND)
    expect(runtime).toBeTruthy()
    expect(runtime!.backend).toBe(CLAUDE_BACKEND)
    expect(runtime!.cliInstalled).toBe(true)
  })

  test('02 lazy focus warms Claude without blocking auth modal', async () => {
    test.skip(!claudeAvailable, 'Claude not in agent toolbar')
    await page.locator('[data-testid="agent-sidebar-claude"]').click({ force: true })
    await page.locator('[data-testid="chat-input"]').focus()
    const status = await waitForConnectionStatus(
      page,
      ['connecting', 'auth_required', 'connected', 'disconnected', 'error'],
      60_000,
    )
    expect(status).toBeTruthy()
    await expect(page.locator('[data-testid="acp-auth-modal"]')).toBeHidden({ timeout: 5_000 })
  })

  test('03 Claude connects and enables slash chips @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!claudeAvailable, 'Claude not in agent toolbar')
    test.skip(!claudeConnected, `Claude not connected (${warmupDetail})`)

    const chipsReady = await waitForAgentSlashReady(page, 30_000)
    expect(chipsReady).toBe(true)
    await expect(page.locator('[data-testid="acp-connection-status"]')).toHaveAttribute(
      'data-status',
      /connected|connecting/,
    )
  })

  test('04 Claude writes vault file on disk @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!process.env.E2E_CLAUDE_AGENT_WRITE, 'Set E2E_CLAUDE_AGENT_WRITE=1 — use npm run test:e2e:claude-agent-write')
    test.skip(!claudeConnected, `Claude not connected (${warmupDetail})`)
    test.setTimeout(480_000)

    await ensureAgentYoloMode(page)
    await waitForAgentSlashReady(page, 60_000)
    await waitForAgentTurnIdle(page, 120_000, { requireSlashChips: true }).catch(() => {})

    const marker = `E2E_CLAUDE_WRITE_${Date.now()}`
    const relPath = `01_日记与计划/Inbox/e2e-claude-write-${Date.now()}.md`
    const absPath = path.join(workspace, ...relPath.split('/'))

    const chatInput = page.locator('[data-testid="chat-input"]')
    await chatInput.fill(
      [
        '请使用 Write 工具写入文件（只写一次）。',
        `相对路径：${relPath}`,
        `文件内容必须恰好一行：${marker}`,
        '写完后回复 DONE。',
      ].join('\n'),
    )
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 20_000 })
    await page.locator('[data-testid="send-button"]').click()
    await expect(page.locator('[data-testid="send-button"]')).toBeDisabled({ timeout: 30_000 })

    await expect.poll(async () => {
      await approveAcpPermissionIfVisible(page)
      if (fs.existsSync(absPath) && readVaultFileUtf8(absPath).includes(marker)) return true
      return scanWorkspaceForMarker(workspace, marker)
    }, { timeout: 360_000, intervals: [2_000] }).toBe(true)

    await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: false }).catch(() => {})
    await expectNoRethinkJsonInVisibleAgentReplies(page)
  })

  test('05 Claude one-shot ping returns exact token @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!claudeConnected, `Claude not connected (${warmupDetail})`)
    test.setTimeout(300_000)

    const marker = `E2E_CLAUDE_${Date.now()}`
  await sendAgentPingAndExpectMarker(page, marker, 180_000)
  await expectNoRethinkJsonInVisibleAgentReplies(page)

  const agentMessages = page.locator('[data-testid="agent-message"]')
  const replyText = (await agentMessages.last().innerText()).trim()
  expect(replyText.length).toBeGreaterThan(0)
  expect(replyText).toContain(marker)
  })

  test('06 slash chip /today activates without sending @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!claudeConnected, `Claude not connected (${warmupDetail})`)

    const chip = page.locator('[data-testid="slash-chip-today"]')
    await chip.click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/today', { timeout: 8_000 })
    await page.locator('.agent-panel__command-active').getByRole('button', { name: /取消|Cancel/i }).click()
    await expect(page.locator('.agent-panel__command-active')).toHaveCount(0, { timeout: 5_000 })
  })

  test('07 Claude /today slash writeback @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!process.env.E2E_CLAUDE_FULL_WRITEBACK, 'Set E2E_CLAUDE_FULL_WRITEBACK=1 for full /today slash (slow, quota-heavy)')
    test.skip(!claudeConnected, `Claude not connected (${warmupDetail})`)
    test.setTimeout(420_000)

    await ensureAgentYoloMode(page)
    await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: true }).catch(() => {})

    const today = await getEffectiveTodayFromApp(page)
    const planFileName = getDailyPlanFileName(today)
    const planPaths = buildPlanPathCandidates(workspace, today)
    const beforeMtime: Record<string, number> = {}
    const beforeLength: Record<string, number> = {}
    for (const planPath of planPaths) {
      beforeMtime[planPath] = fs.existsSync(planPath) ? fs.statSync(planPath).mtimeMs : 0
      beforeLength[planPath] = fs.existsSync(planPath) ? readVaultFileUtf8(planPath).length : 0
    }

    await page.locator('[data-testid="slash-chip-today"]').click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/today', { timeout: 8_000 })
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 20_000 })
    await page.locator('[data-testid="send-button"]').click()

    await expect.poll(async () => {
      await approveAcpPermissionIfVisible(page)
      if (await messageListShowsWritebackVerified(page)) return true
      const tabOpen = await page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName }).isVisible().catch(() => false)
      if (tabOpen) return true
      return detectPlanWrite(planPaths, beforeMtime, beforeLength)
    }, { timeout: 300_000, intervals: [3_000] }).toBe(true)

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName })).toBeVisible({
      timeout: 60_000,
    })
    await waitForAgentTurnIdle(page, 120_000, { requireSlashChips: false }).catch(() => {})
    await expectNoRethinkJsonInVisibleAgentReplies(page)

    await closeTabByName(page, planFileName)
  })
})
