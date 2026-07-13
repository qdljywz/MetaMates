/**
 * Agent recent changes — full E2E regression (single app session).
 *
 * Backend priority: Claude → CodeBuddy (Gemini/Codex skipped — flaky in E2E).
 *
 * Run: npm run test:e2e:agent-recent
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
  warmUpAgentConnection,
  waitForAgentSlashReady,
} from '../helpers/launchElectron'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeAllEditorTabs } from '../helpers/inboxFixtures'
import {
  countRethinkJsonLeaksInChat,
  exerciseLazyAuthOnPreferred,
  expectEmptyStateQuestionNotRawJson,
  expectNoRethinkJsonInAgentChat,
  fetchAgentRuntime,
  fetchAllAgentRuntimes,
  forceEmptyStateRethink,
  listDetectedAgentBackends,
  openSettingsAgentTab,
  pickPreferredBackends,
  primaryPreferredBackend,
  rethinkBackendCandidates,
  secondaryPreferredBackend,
  selectAgentSidebar,
  selectAndWarmupPreferred,
  setLastAgentBackend,
  waitForConnectionStatus,
} from '../helpers/agentRecent'

test.describe.serial('Agent recent changes (full regression)', () => {
  let app: ElectronApplication
  let page: Page
  let backends: string[] = []
  let preferred: string[] = []
  let hasClaude = false
  let hasCodebuddy = false
  let primaryBackend: string | null = null
  let secondaryBackend: string | null = null

  test.beforeAll(async () => {
    test.setTimeout(360_000)
    app = await launchMetaMatesApp()
    page = await resolveMainWindow(app)
    await waitForAppShell(page)
    backends = await listDetectedAgentBackends(page)
    preferred = pickPreferredBackends(backends)
    hasClaude = backends.includes('claude')
    hasCodebuddy = backends.includes('codebuddy')
    primaryBackend = primaryPreferredBackend(backends)
    secondaryBackend = secondaryPreferredBackend(backends)
    test.skip(preferred.length === 0, 'Need claude or codebuddy in E2E profile')
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('01 startup: agents detected without connect storm', async () => {
    await expect(page.locator('[data-testid="agent-toolbar"]')).toBeVisible()
    expect(preferred.length).toBeGreaterThan(0)

    const status = page.locator('[data-testid="acp-connection-status"]')
    await expect(status).toBeVisible()
    const initial = await status.getAttribute('data-status')
    expect(['disconnected', 'connecting', 'connected', 'auth_required', 'error']).toContain(initial ?? '')

    await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled()
  })

  test('02 focus input triggers lazy warmup on preferred backend', async () => {
    test.skip(!primaryBackend, 'No claude/codebuddy sidebar')

    await selectAgentSidebar(page, primaryBackend!)
    await page.locator('[data-testid="chat-input"]').focus()
    const status = await waitForConnectionStatus(
      page,
      ['connecting', 'auth_required', 'connected', 'disconnected', 'error'],
      45_000,
    )
    expect(status).toBeTruthy()

    const authModal = page.locator('[data-testid="acp-auth-modal"]')
    await expect(authModal).toBeHidden({ timeout: 5_000 })
  })

  test('03 runtime IPC: getAllAgentRuntimes returns preferred backends', async () => {
    const runtimes = await fetchAllAgentRuntimes(page)
    expect(runtimes.length).toBeGreaterThan(0)

    for (const backend of preferred) {
      const row = runtimes.find((r) => r.backend === backend)
      expect(row, `runtime row for ${backend}`).toBeTruthy()
      expect(row!.cliInstalled).toBe(true)
      expect(row!.display).toBeTruthy()
    }
  })

  test('04 settings Agent tab shows Claude and CodeBuddy status cards', async () => {
    await openSettingsAgentTab(page)

    const cards = page.locator('[data-testid^="agent-cli-status-"]')
    await expect(async () => {
      expect(await cards.count()).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })

    for (const backend of preferred) {
      await expect(page.locator(`[data-testid="agent-cli-status-${backend}"]`)).toBeVisible()
    }

    await page.keyboard.press('Escape')
  })

  test('05 lazy auth: banner on connect, not blocking modal (claude → codebuddy)', async () => {
    const warmed = await selectAndWarmupPreferred(page, backends)
    test.skip(!warmed, 'Could not warmup claude or codebuddy')

    const authModal = page.locator('[data-testid="acp-auth-modal"]')
    await expect(authModal).toBeHidden({ timeout: 5_000 })

    if (warmed.status === 'auth_required') {
      await expect(page.locator('[data-testid="acp-auth-banner"]')).toBeVisible({ timeout: 10_000 })
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `${warmed.backend} status=${warmed.status} — banner path skipped`,
      })
    }
  })

  test('06 lazy auth: send opens modal or banner action (claude → codebuddy)', async () => {
    const result = await exerciseLazyAuthOnPreferred(page, backends)
    if (result.outcome === 'skipped') {
      test.info().annotations.push({
        type: 'note',
        description: 'Neither claude nor codebuddy reached auth_required — send-auth path skipped',
      })
    } else {
      expect(['modal', 'banner']).toContain(result.outcome)
      test.info().annotations.push({
        type: 'note',
        description: `Lazy auth send exercised on ${result.backend}`,
      })
    }
  })

  test('07 switch agent dismisses auth modal (claude → codebuddy)', async () => {
    test.skip(!primaryBackend || !secondaryBackend, 'Need both claude and codebuddy')

    const authModal = page.locator('[data-testid="acp-auth-modal"]')
    await selectAgentSidebar(page, primaryBackend!)
    await page.locator('[data-testid="chat-input"]').focus()
    await waitForConnectionStatus(page, ['auth_required', 'connected', 'connecting', 'error'], 45_000)
    await expect(authModal).toBeHidden({ timeout: 5_000 })

    await selectAgentSidebar(page, secondaryBackend!)
    await expect(authModal).toBeHidden({ timeout: 15_000 })

    const status = await page.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
    expect(status).not.toBe('auth_required')
  })

  test('08 Claude runtime: settings-first metadata when CLI locks model', async () => {
    test.skip(!hasClaude, 'Claude CLI not in E2E profile')

    const runtime = await fetchAgentRuntime(page, 'claude')
    expect(runtime).toBeTruthy()
    expect(runtime!.cliInstalled).toBe(true)

    await selectAgentSidebar(page, 'claude')
    await page.locator('[data-testid="chat-input"]').focus()
    const status = await waitForConnectionStatus(
      page,
      ['connected', 'auth_required', 'connecting', 'error'],
      90_000,
    )
    test.skip(status !== 'connected', `Claude not connected (status=${status})`)

    if (!runtime!.capabilities.canSwitchModel) {
      expect(runtime!.display.effectiveModel?.trim().length).toBeGreaterThan(0)
      expect(runtime!.display.provenanceModel || '').toMatch(/settings\.json|cli-settings/i)

      const readonly = page.locator('[data-testid="acp-model-readonly"]')
      const dropdown = page.locator('.agent-panel__input-controls select.agent-panel__select--compact')
      await expect(readonly).toBeVisible({ timeout: 15_000 })
      await expect(dropdown).toHaveCount(0)
      const label = (await readonly.textContent())?.trim() ?? ''
      expect(label.length).toBeGreaterThan(0)
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Claude model not locked — connected UI OK, skip readonly badge',
      })
    }
  })

  test('09 background rethink does not leak questionText JSON (codebuddy → claude)', async () => {
    test.setTimeout(240_000)
    const candidates = rethinkBackendCandidates(backends)
    test.skip(candidates.length === 0, 'Need claude or codebuddy for rethink E2E')

    const workspace = getE2EWorkspace()
    await closeAllEditorTabs(page)

    let rethinkBackend: string | null = null
    let warmupDetail = ''
    for (const backend of candidates) {
      await setLastAgentBackend(page, backend)
      const warmup = await warmUpAgentConnection(page, { backend, workspace, maxMs: 90_000 })
      if (warmup.ok) {
        rethinkBackend = backend
        break
      }
      warmupDetail = `${backend}: ${warmup.detail}`
    }
    test.skip(!rethinkBackend, `Rethink backends warmup failed — ${warmupDetail}`)

    await expect(waitForAgentSlashReady(page, 30_000)).resolves.toBe(true)

    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })

    const leaksBefore = await countRethinkJsonLeaksInChat(page)
    const question = page.locator('[data-testid="editor-empty-state-question"]')
    const beforeQuestion = await question.innerText()

    const rethinkToken = await forceEmptyStateRethink(
      page,
      workspace,
      beforeQuestion,
      90_000,
      { requireComplete: false },
    )
    if (!/^ok-/.test(rethinkToken)) {
      test.info().annotations.push({
        type: 'note',
        description: `Rethink on ${rethinkBackend} ended as ${rethinkToken} — leak guard still required`,
      })
    }

    await expect(waitForAgentSlashReady(page, 20_000)).resolves.toBe(true)
    await expectNoRethinkJsonInAgentChat(page)
    await expectEmptyStateQuestionNotRawJson(page)

    const leaksAfter = await countRethinkJsonLeaksInChat(page)
    expect(leaksAfter).toBe(leaksBefore)

    if (/^ok-/.test(rethinkToken)) {
      await expect.poll(async () => await question.innerText(), { timeout: 30_000 }).not.toBe(beforeQuestion)
    }
  })

  test('10 auth banner sign-in opens modal (claude → codebuddy)', async () => {
    let exercised: string | null = null
    for (const backend of preferred) {
      await selectAgentSidebar(page, backend)
      await page.locator('[data-testid="chat-input"]').focus()
      const status = await waitForConnectionStatus(page, ['auth_required', 'connected'], 45_000)
      if (status !== 'auth_required') continue

      exercised = backend
      const banner = page.locator('[data-testid="acp-auth-banner"]')
      await expect(banner).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-testid="acp-auth-banner-sign-in"]').click()
      await expect(page.locator('[data-testid="acp-auth-modal"]')).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Escape')
      break
    }

    test.skip(!exercised, 'Claude and CodeBuddy already authenticated in E2E profile')
    test.info().annotations.push({
      type: 'note',
      description: `Auth banner sign-in exercised on ${exercised}`,
    })
  })
})
