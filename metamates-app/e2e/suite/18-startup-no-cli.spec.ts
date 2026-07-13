import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { getE2EWorkspace } from '../helpers/myM2Fixtures'
import { closeAllEditorTabs, readInboxCountFromEmptyState } from '../helpers/inboxFixtures'

/**
 * @suite No CLI — install guide + empty-state degradation when no agents detected
 */
test.describe.serial('@suite Startup without CLI', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    app = await launchMetaMatesApp(workspace, { noAgents: true })
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('agent panel shows CLI install guide instead of chat', async () => {
    const guide = page.locator('[data-testid="agent-cli-install-guide"]')
    await expect(guide).toBeVisible({ timeout: 45_000 })
    await expect(guide).toContainText(/CLI|灵感仓库|笔记仓库|note vault|AI assistant|AI 助手/i)
    await expect(page.locator('[data-testid="slash-chip-today"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="chat-input"]')).toHaveCount(0)
  })

  test('editor empty-state shows no-agent status', async () => {
    await closeAllEditorTabs(page)
    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty).toBeVisible({ timeout: 15_000 })
    await expect(empty).toContainText(/未检测到|No AI assistant/i)
    const statusTag = empty.locator('.ant-tag')
    await expect(statusTag).toContainText(/未检测到|No AI assistant/i)
  })

  test('empty-state still offers vault actions without agent', async () => {
    const empty = page.locator('[data-testid="editor-empty-state"]')
    await expect(empty.locator('button').first()).toBeVisible()
    await expect(empty).toContainText(/安装|Install|收件箱|Inbox|引擎/i)
    const inboxCount = await readInboxCountFromEmptyState(empty)
    expect(inboxCount).toBeGreaterThanOrEqual(0)
  })

  test('empty-state install button focuses agent install guide without chat', async () => {
    const primary = page.locator('[data-testid="editor-empty-state-primary"]')
    await expect(primary).toBeVisible({ timeout: 10_000 })
    await expect(primary).toContainText(/安装|Install/i)
    await primary.scrollIntoViewIfNeeded()
    await primary.click()
    const guide = page.locator('[data-testid="agent-cli-install-guide"]')
    await expect(guide).toBeVisible({ timeout: 10_000 })
    await expect(guide.getByRole('button', { name: /安装 AI 助手|Install AI assistant/i })).toBeVisible()
    await expect(page.locator('[data-testid="chat-input"]')).toHaveCount(0)
  })
})
