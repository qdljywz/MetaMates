import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from './helpers/launchElectron'
import {
  E2E_SANDBOX_DIR_NAME,
  ensureE2ESandbox,
  getE2EWorkspace,
} from './helpers/myM2Fixtures'
import { WORKSPACE_LAYOUT } from '../src/constants/paths'

const PROJECTS_DIR = WORKSPACE_LAYOUT.zh.PROJECTS

function normalizeExpanded(value: string | null): 'true' | 'false' {
  return value === 'true' ? 'true' : 'false'
}

async function ensureExpanded(item: Locator) {
  const row = item.first()
  await expect(row).toBeVisible()
  const expanded = normalizeExpanded(await row.getAttribute('aria-expanded'))
  if (expanded === 'false') {
    await row.locator('.ant-tree-switcher').first().click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
  }
}

test.describe.serial('File tree caret stability', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()

  test.beforeAll(async () => {
    ensureE2ESandbox(workspace)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: true })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('single caret click toggles once and remains stable', async () => {
    await ensureExpanded(page.getByRole('treeitem', { name: new RegExp(PROJECTS_DIR) }))

    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const switcher = sandboxItem.locator('.ant-tree-switcher').first()
    await expect(sandboxItem).toBeVisible()

    const before = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    await switcher.click()
    const after = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(after).not.toBe(before)

    // Guard against "double-jump": state must not flip back shortly after the click.
    await page.waitForTimeout(500)
    const stable = normalizeExpanded(await sandboxItem.getAttribute('aria-expanded'))
    expect(stable).toBe(after)
  })

  test('toggling one folder does not change sibling folder', async () => {
    await ensureExpanded(page.getByRole('treeitem', { name: new RegExp(PROJECTS_DIR) }))

    const sandboxItem = page.getByRole('treeitem', { name: new RegExp(E2E_SANDBOX_DIR_NAME) }).first()
    const siblingItem = page.getByRole('treeitem', { name: /创元生科/ }).first()
    await expect(sandboxItem).toBeVisible()
    await expect(siblingItem).toBeVisible()

    const siblingBefore = normalizeExpanded(await siblingItem.getAttribute('aria-expanded'))
    await sandboxItem.locator('.ant-tree-switcher').first().click()
    await page.waitForTimeout(300)
    const siblingAfter = normalizeExpanded(await siblingItem.getAttribute('aria-expanded'))

    expect(siblingAfter).toBe(siblingBefore)
  })
})
