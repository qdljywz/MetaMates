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
import {
  E2E_DRAG_ITEM_FILE,
  E2E_DRAG_SUB_DIR,
  E2E_LINK_SEED_FILE,
  E2E_LINK_TARGET_FILE,
  E2E_NOTE_PREFIX,
  E2E_SANDBOX_DIR_NAME,
  buildE2ENotePath,
  ensureE2ELinkSeed,
  ensureE2ELinkTarget,
  ensureE2ESandbox,
  getE2EWorkspace,
  removeE2EFile,
} from '../helpers/myM2Fixtures'
import { pickContextMenuItem, rightClickTreeTitle } from '../helpers/contextMenu'
import { openCommandPalette, openDailyNoteShortcut, openDailyPlanShortcut, openGlobalSearch, toggleFileTreeShortcut } from '../helpers/shortcuts'
import { ensureFolderExpanded, ensureTreeFileVisible, refreshFileTree } from '../helpers/treeActions'
import {
  closeTabByName,
  closeAllTabs,
  expectCommandPaletteVisible,
  expectElectronWorkspace,
  expectNoDirectoryReadError,
  expectNoFirstRunModals,
  expectSplashDismissed,
  normalizeAriaExpanded,
} from '../helpers/assertions'
import {
  expectVaultFileMissing,
  readVaultFileUtf8,
  vaultFileExists,
} from '../helpers/vaultAssert'
import {
  getDailyNoteFileName,
  getDailyPlanFileName,
  getDailyNotePath,
  getDailyPlanPath,
  getTodayDateString,
  WORKSPACE_LAYOUT,
} from '../../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS
const INBOX_DIR = path.join(WORKSPACE_LAYOUT.zh.LOG_AND_PLAN, WORKSPACE_LAYOUT.zh.INBOX)

function commandPalette(page: Page) {
  return page.locator('.ant-modal-wrap').filter({
    has: page.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]'),
  })
}

/**
 * Canonical E2E — ONE Electron launch, serial steps, validates effectiveness (disk + UI).
 * Default `npm run test:e2e` runs only this file (E2E_SINGLE_SESSION=1).
 *
 * Default: steps 1–24 + 28 (no LLM prompts). Agent-live steps 25–27 require E2E_AGENT_LIVE=1.
 * Run agent smoke once: npm run test:e2e:agent-live
 */
test.describe.serial('@suite Full journey (single session)', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const sandboxPath = ensureE2ESandbox(workspace)
  const today = getTodayDateString()
  const noteFileName = getDailyNoteFileName(today)
  const planFileName = getDailyPlanFileName(today)
  const notePath = getDailyNotePath(workspace, today, 'zh')
  const planPath = getDailyPlanPath(workspace, today, 'zh')
  const seedPath = ensureE2ELinkSeed(workspace)
  const linkTargetPath = ensureE2ELinkTarget(workspace)

  let createdNotePath = ''
  let noteName = ''
  let renamedName = ''
  let renamedPath = ''
  let templateFilePath = ''
  let dragItemPath = ''
  let originalSeedContent = ''
  let agentAvailable = false
  let agentConnected = false
  let codebuddyAvailable = false
  let folderPath = ''
  let inboxNotePath = ''
  let paletteNotePath = ''
  const inboxPath = path.join(workspace, INBOX_DIR)

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    process.env.E2E_SINGLE_SESSION = '1'
    if (!fs.existsSync(workspace)) {
      throw new Error(`E2E workspace not found: ${workspace}`)
    }
    originalSeedContent = readVaultFileUtf8(seedPath)
    ensureE2ESandbox(workspace)
    dragItemPath = path.join(sandboxPath, E2E_DRAG_ITEM_FILE)
    fs.writeFileSync(dragItemPath, '# E2E drag item\n', 'utf8')
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)
    agentAvailable = (await page.locator('[data-testid^="agent-pill-"], [data-testid^="agent-sidebar-"]').count()) > 0
    codebuddyAvailable =
      (await page.locator('[data-testid="agent-sidebar-codebuddy"]').count()) > 0 ||
      (await page.locator('[data-testid="switch-agent-codebuddy"]').count()) > 0

    if (E2E_AGENT_LIVE && codebuddyAvailable) {
      const warmup = await warmUpAgentConnection(page, { backend: 'codebuddy', workspace })
      agentConnected = warmup.ok
      if (!warmup.ok) {
        console.warn(`[E2E] CodeBuddy warmup failed (${warmup.reason}): ${warmup.detail}`)
      }
    } else if (E2E_AGENT_LIVE) {
      agentConnected = false
      console.warn('[E2E] E2E_AGENT_LIVE=1 but CodeBuddy not in toolbar — agent steps will skip')
    } else {
      agentConnected = false
      console.log('[E2E] Agent-live off — steps 25–27 skipped (no CLI warmup)')
    }
  })

  test.afterAll(async () => {
    try {
      fs.writeFileSync(seedPath, originalSeedContent, 'utf8')
    } catch {
      // best-effort restore
    }
    removeE2EFile(createdNotePath)
    removeE2EFile(renamedPath)
    removeE2EFile(templateFilePath)
    removeE2EFile(dragItemPath)
    removeE2EFile(path.join(workspace, PROJECTS_DIR, E2E_DRAG_ITEM_FILE))
    removeE2EFile(path.join(sandboxPath, E2E_DRAG_SUB_DIR, E2E_DRAG_ITEM_FILE))
    removeE2EFile(inboxNotePath)
    removeE2EFile(paletteNotePath)
    if (folderPath && fs.existsSync(folderPath)) {
      try {
        fs.rmSync(folderPath, { recursive: true, force: true })
      } catch {
        // best-effort
      }
    }
    if (app) await closeElectronApp(app)
  })

  test('01 startup: splash gone, no first-run modals', async () => {
    await expectSplashDismissed(page)
    await expectNoFirstRunModals(page)
  })

  test('02 workspace bound, file tree and status bar', async () => {
    await expectElectronWorkspace(page, workspace)
    await expect(page.locator('[data-testid="file-tree"] .ant-tree-title').first()).toBeVisible({
      timeout: 30_000,
    })
    const layout = await page.evaluate(() => {
      const status = document.querySelector('.status-bar') as HTMLElement | null
      const appContainer = document.querySelector('.app-container') as HTMLElement | null
      return {
        innerHeight: window.innerHeight,
        statusBottom: status?.getBoundingClientRect().bottom ?? 0,
        appContainerBottom: appContainer?.getBoundingClientRect().bottom ?? 0,
      }
    })
    expect(layout.statusBottom).toBeGreaterThan(layout.innerHeight * 0.85)
    expect(Math.abs(layout.appContainerBottom - layout.innerHeight)).toBeLessThan(6)
  })

  test('03 agent panel ready', async () => {
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-testid="agent-toolbar"]')).toBeVisible({ timeout: 30_000 })
  })

  test('04 file tree: folder click safe, caret stable', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: E2E_SANDBOX_DIR_NAME }).click()
    await expectNoDirectoryReadError(page)

    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const before = normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))
    await sandboxItem.locator('.ant-tree-switcher').first().click({ force: true })
    const after = normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(after).not.toBe(before)
    await page.waitForTimeout(300)
    expect(normalizeAriaExpanded(await sandboxItem.getAttribute('aria-expanded'))).toBe(after)
  })

  test('05 shell: Ctrl+B collapses and expands file tree', async () => {
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible()
    await toggleFileTreeShortcut(page)
    await expect(page.locator('[data-testid="file-tree"]')).toHaveCount(0, { timeout: 5_000 })
    await toggleFileTreeShortcut(page)
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 5_000 })
  })

  test('06 editor: open seed note and wiki link picker filters skills', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })

    await page.locator('.cm-content').click()
    await page.getByRole('button', { name: '[[ ]]' }).click()
    const modal = page.locator('.ant-modal').filter({
      hasText: /选择或创建链接目标|Select or create link target/i,
    })
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await expect(modal.locator('.ant-list-item').filter({ hasText: 'challenge' })).toHaveCount(0)
    await modal.locator('button.ant-modal-close').click()
    await expect(modal).toBeHidden({ timeout: 10_000 })
  })

  test('07 editor: auto-save writes changes to disk', async () => {
    const marker = `E2E_PERSIST_${Date.now()}`
    await page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(marker)
    await expect.poll(() => readVaultFileUtf8(seedPath).includes(marker), { timeout: 15_000 }).toBe(true)
  })

  test('08 editor: preview mode and wiki link opens target tab', async () => {
    await page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('[[e2e')
    const completion = page.getByRole('option', { name: 'e2e-link-target' })
    await expect(completion).toBeVisible({ timeout: 5_000 })
    await completion.click()
    await expect.poll(() => readVaultFileUtf8(seedPath).includes('e2e-link-target'), { timeout: 15_000 }).toBe(true)

    await page.locator('.editor-area button .anticon-eye').locator('..').click()
    await expect(page.locator('.cm-content')).toBeHidden({ timeout: 5_000 })
    await page.locator('.editor-area a').filter({ hasText: 'e2e-link-target' }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_TARGET_FILE })).toBeVisible({
      timeout: 15_000,
    })
    await closeTabByName(page, E2E_LINK_TARGET_FILE)
    await page.locator('.editor-area button .anticon-edit').locator('..').click()
    await closeTabByName(page, E2E_LINK_SEED_FILE)
  })

  test('09 global search: find seed and open tab', async () => {
    await openGlobalSearch(page)
    const modal = page.locator('.ant-modal').filter({
      has: page.locator('input[placeholder*="搜索笔记"], input[placeholder*="Search notes"]'),
    })
    await expect(modal).toBeVisible({ timeout: 10_000 })
    const spin = modal.locator('.ant-spin')
    if (await spin.isVisible().catch(() => false)) {
      await expect(spin).toBeHidden({ timeout: 60_000 })
    }
    await modal.locator('input[placeholder*="搜索笔记"], input[placeholder*="Search notes"]').fill('E2E link seed')
    await expect(modal.locator('.ant-list-item').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 30_000,
    })
    await modal.locator('.ant-list-item').filter({ hasText: E2E_LINK_SEED_FILE }).first().click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })
    await closeTabByName(page, E2E_LINK_SEED_FILE)
  })

  test('10 file tree: create note in sandbox', async () => {
    noteName = `${E2E_NOTE_PREFIX}${Date.now()}`
    createdNotePath = buildE2ENotePath(workspace, noteName)

    await page.keyboard.press('Escape')
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_SANDBOX_DIR_NAME }).click({ button: 'right' })
    await page
      .locator('.metamates-context-menu .ant-menu-item')
      .filter({ hasText: /新建笔记|New Note/i })
      .first()
      .click()

    const modal = page.locator('.ant-modal').filter({ hasText: /新建笔记|New Note/i })
    await modal.locator('input').fill(noteName)
    await modal.locator('input').press('Enter')

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(createdNotePath), { timeout: 15_000 }).toBe(true)
  })

  test('11 file ops: rename updates disk and tab', async () => {
    renamedName = `${noteName}-renamed`
    renamedPath = buildE2ENotePath(workspace, renamedName)

    await rightClickTreeTitle(page, noteName)
    await pickContextMenuItem(page, /重命名|Rename/i)
    const renameModal = page.locator('.ant-modal').filter({ hasText: /重命名|Rename/i })
    await renameModal.locator('input').fill(renamedName)
    await renameModal.locator('input').press('Enter')

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: renamedName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(renamedPath), { timeout: 15_000 }).toBe(true)
    expectVaultFileMissing(createdNotePath)
    createdNotePath = ''
  })

  test('12 file ops: delete removes disk file and tab', async () => {
    await rightClickTreeTitle(page, renamedName)
    await pickContextMenuItem(page, /^删除$|^Delete$/i)
    const deleteModal = page.locator('.ant-modal').filter({ hasText: /确认删除|Confirm delete/i })
    await deleteModal.getByRole('button', { name: /删\s*除|Delete/i }).click()

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: renamedName })).toHaveCount(0, {
      timeout: 15_000,
    })
    await expect(
      page.locator('[data-testid="tab-bar"] > div').filter({
        has: page.locator('span').filter({ hasText: `${noteName}.md`, exact: true }),
      }),
    ).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => !vaultFileExists(renamedPath), { timeout: 15_000 }).toBe(true)
    renamedPath = ''
  })

  test('13 file tree: disk move syncs into target folder in tree', async () => {
    const subDirPath = path.join(sandboxPath, E2E_DRAG_SUB_DIR)
    const movedPath = path.join(subDirPath, E2E_DRAG_ITEM_FILE)
    fs.mkdirSync(subDirPath, { recursive: true })

    if (vaultFileExists(movedPath) && !vaultFileExists(dragItemPath)) {
      fs.renameSync(movedPath, dragItemPath)
    }
    if (!vaultFileExists(dragItemPath)) {
      fs.writeFileSync(dragItemPath, '# E2E drag item\n', 'utf8')
    }

    if (!(await page.locator('[data-testid="file-tree"]').isVisible().catch(() => false))) {
      await toggleFileTreeShortcut(page)
    }

    fs.renameSync(dragItemPath, movedPath)
    dragItemPath = movedPath

    await refreshFileTree(page)
    await ensureTreeFileVisible(page, E2E_DRAG_ITEM_FILE, [PROJECTS_DIR, E2E_SANDBOX_DIR_NAME, E2E_DRAG_SUB_DIR])
    expect(vaultFileExists(movedPath)).toBe(true)
    expect(vaultFileExists(path.join(sandboxPath, E2E_DRAG_ITEM_FILE))).toBe(false)
  })

  test('14 activity bar: template creates file on disk', async () => {
    templateFilePath = path.join(workspace, `${today} 每日计划.md`)

    await page.click('[data-testid="activity-template"]')
    const templateModal = page.locator('.ant-modal-wrap').filter({
      has: page.locator('.template-selector-modal'),
    })
    await expect(templateModal).toBeVisible({ timeout: 10_000 })
    await templateModal.locator('.ant-card').filter({ hasText: '每日计划' }).first().click()
    await templateModal.getByRole('button', { name: /使用模板|Use template/i }).click()

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: /每日计划/ })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(templateFilePath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, `${today} 每日计划.md`)
  })

  test('15 calendar: double-click note, Shift+click plan, open in graph', async () => {
    const calendar = page.locator('.vault-activity-calendar')
    await expect(calendar).toBeVisible()
    await calendar.getByRole('button', { name: '›' }).click()
    await calendar.getByRole('button', { name: '‹' }).click()
    await calendar.getByRole('button', { name: /今天|Today/i }).click()

    await page.locator(`[data-testid="calendar-date-${today}"]`).dblclick()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(notePath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, noteFileName)

    await page.locator(`[data-testid="calendar-date-${today}"]`).click({ modifiers: ['Shift'] })
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(planPath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, planFileName)

    await page.locator(`[data-testid="calendar-date-${today}"]`).click()
    await calendar.getByRole('button', { name: /^日记$|^Note$/i }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await closeTabByName(page, noteFileName)

    await page.locator(`[data-testid="calendar-date-${today}"]`).click()
    const listItem = calendar.locator('button').filter({ hasText: E2E_LINK_SEED_FILE }).first()
    if (await listItem.isVisible().catch(() => false)) {
      await listItem.click()
      await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
        timeout: 15_000,
      })
      await closeTabByName(page, E2E_LINK_SEED_FILE)
    }

    await page.locator(`[data-testid="calendar-date-${today}"]`).click()
    await calendar
      .getByRole('button', { name: /在图谱中查看|Open in graph/i })
      .click()

    const graphModal = page.locator('.graph-modal').first()
    await expect(graphModal).toBeVisible({ timeout: 15_000 })
    await expect(graphModal.locator('.ant-segmented-item-label').filter({ hasText: /活动|Activity/i })).toBeVisible({
      timeout: 10_000,
    })
    await page.keyboard.press('Escape')
  })

  test('16 shortcuts: Ctrl+Shift+P opens daily PLAN on disk', async () => {
    await openDailyPlanShortcut(page)
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: planFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(planPath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, planFileName)
  })

  test('17 command palette: daily note and show tags sidebar', async () => {
    await openCommandPalette(page)
    await expectCommandPaletteVisible(page)
    const palette = commandPalette(page)
    await palette.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]').fill('daily')
    await palette.locator('strong').filter({ hasText: /创建今日笔记|Create today/i }).first().click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(notePath), { timeout: 15_000 }).toBe(true)

    await openCommandPalette(page)
    await palette.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]').fill('标签')
    await palette.locator('strong').filter({ hasText: /显示所有标签|Show all tags/i }).first().click()
    await expect(page.locator('.editor-area .ant-tabs-tab-active').filter({ hasText: /标签|Tags/i })).toBeVisible({
      timeout: 10_000,
    })
    await page.keyboard.press('Escape')
    await closeTabByName(page, noteFileName)
  })

  test('18 shortcuts: Ctrl+N and status bar open daily note', async () => {
    await openDailyNoteShortcut(page)
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(notePath), { timeout: 15_000 }).toBe(true)
    await page.getByRole('button', { name: /今日日记|Daily note/i }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: noteFileName })).toBeVisible({
      timeout: 15_000,
    })
    await closeTabByName(page, noteFileName)
  })

  test('19 activity bar: new folder and inbox note on disk', async () => {
    const folderName = `e2e-folder-${Date.now()}`
    folderPath = path.join(workspace, folderName)

    await page.click('[data-testid="activity-newFolder"]')
    const folderModal = page.locator('.ant-modal').filter({ hasText: /新建文件夹|New folder/i })
    await folderModal.locator('input').fill(folderName)
    await folderModal.getByRole('button', { name: /创\s*建|Create/i }).click()
    await expect.poll(() => fs.existsSync(folderPath), { timeout: 15_000 }).toBe(true)

    const beforeInbox = fs.existsSync(inboxPath)
      ? fs.readdirSync(inboxPath).filter((f) => f.endsWith('.md'))
      : []
    await page.click('[data-testid="activity-newNote"]')
    await expect.poll(() => {
      if (!fs.existsSync(inboxPath)) return false
      const after = fs.readdirSync(inboxPath).filter((f) => f.endsWith('.md'))
      const created = after.find((f) => !beforeInbox.includes(f))
      if (created) {
        inboxNotePath = path.join(inboxPath, created)
        return true
      }
      return false
    }, { timeout: 15_000 }).toBe(true)
    expect(vaultFileExists(inboxNotePath)).toBe(true)
  })

  test('20 command palette: new file, graph, and settings', async () => {
    const stem = `e2e-palette-${Date.now()}`
    paletteNotePath = path.join(inboxPath, `${stem}.md`)
    const searchInput = page.locator('input[placeholder*="搜索文件或命令"], input[placeholder*="Search files or commands"]')

    await openCommandPalette(page)
    await expectCommandPaletteVisible(page)
    await searchInput.fill('新建文件')
    await page.keyboard.press('Enter')
    const newFileInput = page.getByPlaceholder(/留空则自动生成|auto-generate/i)
    await expect(newFileInput).toBeVisible({ timeout: 8_000 })
    await newFileInput.fill(stem)
    await newFileInput.press('Enter')
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: `${stem}.md` })).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => vaultFileExists(paletteNotePath), { timeout: 15_000 }).toBe(true)
    await closeTabByName(page, `${stem}.md`)

    await openCommandPalette(page)
    await searchInput.fill('关系图谱')
    await page.keyboard.press('Enter')
    await expect(page.locator('.graph-modal').first()).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')

    await openCommandPalette(page)
    await searchInput.fill('打开设置')
    await page.keyboard.press('Enter')
    const settingsFromPalette = page.locator('.ant-modal-wrap').filter({
      has: page.locator('label').filter({ hasText: /^(主题|Theme)$/ }),
    })
    await expect(settingsFromPalette).toBeVisible({ timeout: 10_000 })
    await settingsFromPalette.getByRole('button', { name: /取\s*消|Cancel/i }).click()
  })

  test('21 editor: split view and links sidebar', async () => {
    await ensureFolderExpanded(page, PROJECTS_DIR)
    await ensureFolderExpanded(page, E2E_SANDBOX_DIR_NAME)
    await page.locator('.ant-tree-title').filter({ hasText: E2E_LINK_SEED_FILE }).click()
    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })

    await page.locator('.editor-area button .anticon-column-width').locator('..').click()
    await expect(page.locator('.cm-content')).toBeVisible()
    await expect(page.locator('.editor-area')).toContainText(/E2E link seed/i)
    await page.locator('.editor-area .ant-tabs-tab').filter({ hasText: /链接|Links/i }).click()
    await expect(page.locator('.editor-area .ant-tabs-tab-active').filter({ hasText: /链接|Links/i })).toBeVisible({
      timeout: 10_000,
    })
    await closeTabByName(page, E2E_LINK_SEED_FILE)
  })

  test('22 help modal opens', async () => {
    await page.keyboard.press('Escape')
    await page.click('[data-testid="help-button"]')
    const help = page.getByRole('dialog', { name: /帮助中心|Help/i })
    await expect(help).toBeVisible({ timeout: 10_000 })
    await help.getByRole('button', { name: /Close|关\s*闭/i }).click()
    await expect(help).toBeHidden({ timeout: 10_000 })
  })

  test('23 graph: search node and double-click opens file', async () => {
    await page.click('[data-testid="activity-graph"]', { timeout: 8_000 })
    const graphModal = page.locator('.graph-modal').first()
    await expect(graphModal).toBeVisible({ timeout: 15_000 })
    const spin = graphModal.locator('.ant-spin')
    if (await spin.isVisible().catch(() => false)) {
      await expect(spin).toBeHidden({ timeout: 60_000 })
    }
    await graphModal.locator('.ant-segmented-item-label').filter({ hasText: /全景|Full/i }).click()
    await graphModal.locator('input[placeholder*="搜索节点"], input[placeholder*="Search nodes"]').fill('e2e-link-seed')
    await expect(graphModal.getByText(/节点:\s*[1-9]/)).toBeVisible({ timeout: 60_000 })

    const canvas = graphModal.locator('[data-testid="graph-2d-canvas"]')
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    await canvas.dblclick({ position: { x: box!.width / 2, y: box!.height / 2 } })

    await expect(page.locator('[data-testid="tab-bar"]').filter({ hasText: E2E_LINK_SEED_FILE })).toBeVisible({
      timeout: 15_000,
    })
    await closeTabByName(page, E2E_LINK_SEED_FILE)
    await page.keyboard.press('Escape')
  })

  test('24 settings: theme toggle persists to document', async () => {
    const beforeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))

    await page.click('[data-testid="settings-button"]')
    const settingsModal = page.locator('.ant-modal-wrap').filter({
      has: page.locator('.ant-modal').filter({ hasText: /设置|Settings/i }),
    })
    await expect(settingsModal).toBeVisible({ timeout: 10_000 })

    const themeField = settingsModal.locator('.ant-form-item').filter({
      has: page.locator('label').filter({ hasText: /^(主题|Theme)$/ }),
    })
    const targetTheme = beforeTheme === 'light' ? 'dark' : 'light'
    await themeField.locator('.ant-select').click()
    await page.locator('.ant-select-item-option').filter({ hasText: targetTheme === 'light' ? /浅色|Light/i : /深色|Dark/i }).click()
    await settingsModal.getByRole('button', { name: /保\s*存|Save/i }).click()

    await expect.poll(
      () => page.evaluate(() => document.documentElement.getAttribute('data-theme')),
      { timeout: 15_000 },
    ).toBe(targetTheme)

    await themeField.locator('.ant-select').click()
    await page.locator('.ant-select-item-option').filter({ hasText: beforeTheme === 'light' ? /浅色|Light/i : /深色|Dark/i }).click()
    await settingsModal.getByRole('button', { name: /保\s*存|Save/i }).click()

    await expect.poll(
      () => page.evaluate(() => document.documentElement.getAttribute('data-theme')),
      { timeout: 15_000 },
    ).toBe(beforeTheme)

    await settingsModal.getByRole('button', { name: /取\s*消|Cancel/i }).click()
    await expect(settingsModal).toBeHidden({ timeout: 10_000 })
  })

  test('25 agent: slash chip and voice inject @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!agentConnected, 'Agent not connected')

    const chip = page.locator('[data-testid="slash-chip-today"]')
    await chip.click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/today', { timeout: 5_000 })
    await page.locator('.agent-panel__command-active').getByRole('button', { name: /取消|Cancel/i }).click()
    await expect(page.locator('.agent-panel__command-active')).toHaveCount(0, { timeout: 5_000 })

    const voiceMarker = `E2E_VOICE_${Date.now()}`
    await page.evaluate((text) => {
      window.__METAMATES_E2E__?.simulateVoiceTranscript?.(text)
    }, voiceMarker)
    await expect(page.locator('[data-testid="chat-input"]')).toHaveValue(new RegExp(voiceMarker), { timeout: 5_000 })
    await page.locator('[data-testid="chat-input"]').fill('')
  })

  test('26 agent: CodeBuddy one-shot ping @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!codebuddyAvailable || !agentConnected, 'CodeBuddy not connected')
    test.setTimeout(240_000)

    await waitForAgentTurnIdle(page, 60_000, { requireSlashChips: true })

    const chatInput = page.locator('[data-testid="chat-input"]')
    const marker = `E2E_CB_${Date.now()}`
    await chatInput.fill(`Reply with exactly this token and nothing else: ${marker}`)
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 15_000 })
    await page.locator('[data-testid="send-button"]').click()

    const messageList = page.locator('[data-testid="message-list"]')
    await expect.poll(async () => {
      await messageList.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const body = (await messageList.innerText()) ?? ''
      return body.includes(marker)
    }, { timeout: 120_000, intervals: [2_000] }).toBe(true)

    await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: false }).catch(() => {})
  })

  test('27 agent: /today writeback updates PLAN on disk @agent-live', async () => {
    test.skip(!E2E_AGENT_LIVE, SKIP_AGENT_LIVE_REASON)
    test.skip(!agentConnected, 'Agent not connected')
    test.setTimeout(300_000)

    const beforeMtime = fs.existsSync(planPath) ? fs.statSync(planPath).mtimeMs : 0
    const beforeContent = fs.existsSync(planPath) ? readVaultFileUtf8(planPath) : ''

    await page.locator('[data-testid="slash-chip-today"]').click()
    await expect(page.locator('.agent-panel__command-active')).toContainText('/today', { timeout: 5_000 })
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 5_000 })
    await page.locator('[data-testid="send-button"]').click()

    await expect.poll(() => {
      if (!fs.existsSync(planPath)) return false
      const mtime = fs.statSync(planPath).mtimeMs
      const content = readVaultFileUtf8(planPath)
      return mtime > beforeMtime || content.length > beforeContent.length + 30
    }, { timeout: 240_000, intervals: [3_000] }).toBe(true)

    await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled({ timeout: 120_000 })
    await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: false }).catch(() => {})
  })

  test('28 editor: closing last tab shows welcome screen', async () => {
    await closeAllTabs(page)
    await expect(page.locator('[data-testid="editor-empty-state"]')).toBeVisible({ timeout: 10_000 })
  })
})
