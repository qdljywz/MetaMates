/**
 * Comprehensive final audit — single Electron session, no LLM prompts.
 *
 * Complements `06-full-journey.spec.ts` (disk + core flows) with exhaustive UI /
 * interaction / layout smoke across shell, settings, agent, editor, graph, plugins.
 *
 * Run alone:  npm run test:e2e:comprehensive-audit
 * Full suite: npm run test:e2e:full  (journey → audit → guardrails)
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
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
import { rightClickTreeTitle } from '../helpers/contextMenu'
import { ensureFolderExpanded } from '../helpers/treeActions'
import { openCommandPalette, openGlobalSearch } from '../helpers/shortcuts'
import {
  closeAllTabs,
  expectCommandPaletteVisible,
  expectElectronWorkspace,
  expectNoDirectoryReadError,
  expectNoFirstRunModals,
  expectSplashDismissed,
} from '../helpers/assertions'
import {
  expectActivityBarItems,
  expectAgentPanelControls,
  expectSettingsSectionsSpaced,
  expectShellChrome,
  openSettingsTab,
  closeTopModal,
  settingsModalLocator,
} from '../helpers/comprehensiveAudit'
import {
  countRethinkJsonLeaksInChat,
  expectEmptyStateQuestionNotRawJson,
  expectNoRethinkJsonInAgentChat,
  fetchAllAgentRuntimes,
  listDetectedAgentBackends,
  pickPreferredBackends,
} from '../helpers/agentRecent'
import { selectAgentSidebar, waitForConnectionStatus } from '../helpers/agentSettings'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

test.describe.serial('@suite Comprehensive final audit (single session)', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  test.beforeAll(async () => {
    test.setTimeout(420_000)
    process.env.E2E_SINGLE_SESSION = '1'
    ensureE2ELinkSeed(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('01 startup shell: splash, workspace, chrome layout', async () => {
    await expectSplashDismissed(page)
    await expectNoFirstRunModals(page)
    await expectElectronWorkspace(page, workspace)
    await expectShellChrome(page)

    const layout = await page.evaluate(() => {
      const status = document.querySelector('.status-bar') as HTMLElement | null
      const agent = document.querySelector('[data-testid="agent-panel"]') as HTMLElement | null
      const tree = document.querySelector('[data-testid="file-tree"]') as HTMLElement | null
      return {
        innerWidth: window.innerWidth,
        statusRight: status?.getBoundingClientRect().right ?? 0,
        agentLeft: agent?.getBoundingClientRect().left ?? 0,
        treeWidth: tree?.getBoundingClientRect().width ?? 0,
      }
    })
    expect(layout.statusRight).toBeGreaterThan(layout.innerWidth * 0.5)
    expect(layout.agentLeft).toBeGreaterThan(layout.treeWidth)
  })

  test('02 activity bar: all primary actions visible', async () => {
    await expectActivityBarItems(page)
  })

  test('03 file tree: context menu opens without directory-read error', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await rightClickTreeTitle(page, E2E_SANDBOX_DIR_NAME)
    await expect(page.locator('.metamates-context-menu')).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press('Escape')
    await expectNoDirectoryReadError(page)
  })

  test('04 settings general: fields and section spacing', async () => {
    await openSettingsTab(page, 'general')
    const modal = settingsModalLocator(page)
    await expect(modal.getByText(/主题|Theme/).first()).toBeVisible()
    await expect(modal.getByText(/字体|Font/).first()).toBeVisible()
    await expect(modal.getByText(/语言|Language/).first()).toBeVisible()
    await expect(modal.getByText(/语音|Speech/).first()).toBeVisible()
    await expectSettingsSectionsSpaced(modal, 2)
    await closeTopModal(page)
  })

  test('05 settings agent: tabs, sections, CLI status cards', async () => {
    await openSettingsTab(page, 'agent')
    const agentTab = page.locator('[data-testid="settings-agent-tab"]')
    await expect(agentTab.getByText(/Mobile capture|手机剪藏/i).first()).toBeVisible()
    await expect(agentTab.getByText(/Extension services|扩展服务|MCP/i).first()).toBeVisible()
    await expect(agentTab.getByText(/Extensions|扩展/i).first()).toBeVisible()
    await expect(agentTab.getByText(/AI 助手|AI assistants/i).first()).toBeVisible()
    await expectSettingsSectionsSpaced(agentTab, 5)

    const cards = page.locator('[data-testid^="agent-cli-status-"]')
    await expect(async () => {
      expect(await cards.count()).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })
  })

  test('06 settings agent: CLI manage panel lists backends and in-app switch', async () => {
    await openSettingsTab(page, 'agent')
    await page
      .getByRole('button', { name: /安装与管理|Install & manage/i })
      .click()
    const panel = page.locator('[data-testid="cli-install-panel"]')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(panel.locator('.ant-list-item').first()).toBeVisible()

    const switches = panel.locator('.ant-switch')
    if ((await switches.count()) > 0) {
      await expect(switches.first()).toBeVisible()
    }
    await closeTopModal(page)
    await closeTopModal(page)
  })

  test('07 settings agent: plugin cards and MCP manager open', async () => {
    await openSettingsTab(page, 'agent')
    await expect(page.locator('[data-testid="plugin-card-document-import"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="plugin-card-offline-speech"]')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /管理扩展服务|Manage extension services/i }).click()
    await expect(page.getByRole('dialog', { name: /扩展服务|MCP|Extension services/i })).toBeVisible({ timeout: 10_000 })
    await closeTopModal(page)
    await closeTopModal(page)
  })

  test('08 settings advanced: calendar field', async () => {
    await openSettingsTab(page, 'advanced')
    await expect(
      page.getByPlaceholder(/\.ics|选择 .ics|Select .ics/i),
    ).toBeVisible({ timeout: 10_000 })
    await closeTopModal(page)
  })

  test('09 agent panel: toolbar, sidebars, input controls', async () => {
    await expectAgentPanelControls(page)
    const backends = await listDetectedAgentBackends(page)
    expect(backends.length).toBeGreaterThan(0)

    const chips = page.locator('[data-testid^="slash-chip-"]')
    await expect(async () => {
      expect(await chips.count()).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })
  })

  test('10 agent lazy connect: focus input does not open auth modal', async () => {
    const backends = await listDetectedAgentBackends(page)
    const preferred = pickPreferredBackends(backends)[0]
    test.skip(!preferred, 'No claude/codebuddy in toolbar')

    await selectAgentSidebar(page, preferred!)
    await page.locator('[data-testid="chat-input"]').focus()
    await waitForConnectionStatus(page, ['connecting', 'auth_required', 'connected', 'disconnected', 'error'], 45_000)
    await expect(page.locator('[data-testid="acp-auth-modal"]')).toBeHidden({ timeout: 5_000 })
  })

  test('11 agent runtime IPC and no rethink JSON in chat', async () => {
    const runtimes = await fetchAllAgentRuntimes(page)
    expect(runtimes.length).toBeGreaterThan(0)
    await expectNoRethinkJsonInAgentChat(page)
    expect(await countRethinkJsonLeaksInChat(page)).toBe(0)
  })

  test('12 editor: toolbar actions on seed note', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })

    await expect(page.getByRole('button', { name: '[[ ]]' })).toBeVisible()
    await page.locator('.editor-area button .anticon-column-width').locator('..').click()
    await expect(page.locator('.cm-content')).toBeVisible()
    await page.locator('.editor-area button .anticon-eye').locator('..').click()
    await expect(page.locator('.cm-content')).toBeHidden({ timeout: 8_000 })
    await page.locator('.editor-area button .anticon-edit').locator('..').click()
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 8_000 })
  })

  test('13 command palette and global search modals', async () => {
    await openCommandPalette(page)
    await expectCommandPaletteVisible(page)
    await page.keyboard.press('Escape')

    await openGlobalSearch(page)
    const searchModal = page.locator('.ant-modal').filter({
      has: page.locator('input[placeholder*="搜索笔记"], input[placeholder*="Search notes"]'),
    })
    await expect(searchModal).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  })

  test('14 graph modal: 2D canvas and optional dimension switch', async () => {
    await page.click('[data-testid="activity-graph"]', { timeout: 8_000 })
    const graphModal = page.locator('.graph-modal').first()
    await expect(graphModal).toBeVisible({ timeout: 15_000 })
    await expect(graphModal.locator('[data-testid="graph-2d-canvas"]')).toBeVisible({ timeout: 30_000 })

    const dimSwitch = graphModal.locator('[data-testid="graph-dimension-switch"]')
    if (await dimSwitch.isVisible().catch(() => false)) {
      await dimSwitch.click()
      await expect(graphModal.locator('[data-testid="graph-3d-canvas"]')).toBeVisible({ timeout: 30_000 })
    }
    await page.keyboard.press('Escape')
  })

  test('15 calendar widget visible in sidebar', async () => {
    const calendar = page.locator('.vault-activity-calendar')
    await expect(calendar).toBeVisible()
    await expect(calendar.getByRole('button', { name: /^今天$|^Today$/i })).toBeVisible()
  })

  test('16 help center modal', async () => {
    await page.click('[data-testid="help-button"]')
    const help = page.getByRole('dialog', { name: /帮助中心|Help/i })
    await expect(help).toBeVisible({ timeout: 10_000 })
    await help.getByRole('button', { name: /Close|关\s*闭/i }).click()
    await expect(help).toBeHidden({ timeout: 10_000 })
  })

  test('17 empty state: welcome screen and question text sanity', async () => {
    await closeAllTabs(page)
    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="editor-empty-state-primary"]')).toBeVisible()
    await expectEmptyStateQuestionNotRawJson(page)
  })

  test('18 title bar window API smoke (no close)', async () => {
    const api = await page.evaluate(async () => {
      const win = window.electronAPI?.window
      if (!win?.minimize || !win?.maximize) {
        return { ok: false, reason: 'window API missing' }
      }
      const min = await win.minimize()
      const max = await win.maximize()
      return { ok: min?.success === true && max?.success === true }
    })
    expect(api.ok).toBe(true)
  })
})
