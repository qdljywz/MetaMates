import { expect, type Page } from '@playwright/test'
import { STARTUP_FORCE_ENTER_MS } from '../../src/utils/startupUx'

export async function expectSplashDismissed(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="startup-splash"]')).toBeHidden({
    timeout: STARTUP_FORCE_ENTER_MS + 2_000,
  })
}

export async function expectNoFirstRunModals(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="welcome-wizard"]')).toBeHidden()
  const picker = page.locator('.ant-modal-wrap').filter({ hasText: /选择工作区|Select Workspace/i })
  await expect(picker).toHaveCount(0)
}

export async function expectNoDirectoryReadError(page: Page): Promise<void> {
  const errorToast = page.locator('.ant-message-error').filter({ hasText: /EISDIR|读取文件失败|read/i })
  await expect(errorToast).toHaveCount(0, { timeout: 2_000 })
}

export async function expectElectronWorkspace(page: Page, workspace: string): Promise<void> {
  const boot = await page.evaluate(() => {
    const w = window as Window & { __METAMATES_E2E__?: { workspace?: string }; electronAPI?: unknown }
    return {
      hasElectron: typeof w.electronAPI !== 'undefined',
      e2eWorkspace: w.__METAMATES_E2E__?.workspace ?? '',
    }
  })
  expect(boot.hasElectron).toBe(true)
  expect(boot.e2eWorkspace.replace(/\\/g, '/').toLowerCase()).toBe(
    workspace.replace(/\\/g, '/').toLowerCase(),
  )
}

export function normalizeAriaExpanded(value: string | null): 'true' | 'false' {
  return value === 'true' ? 'true' : 'false'
}

export async function expectCommandPaletteVisible(page: Page): Promise<void> {
  await expect(
    page.locator(
      '.ant-modal-wrap input[placeholder*="搜索文件或命令"], .ant-modal-wrap input[placeholder*="Search files or commands"]',
    ).first(),
  ).toBeVisible({ timeout: 8_000 })
}

export async function closeTabByName(page: Page, tabLabel: string): Promise<void> {
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => page.locator('.ant-message-notice').count(), { timeout: 15_000 })
    .toBe(0)
    .catch(() => {})

  const tab = page.locator('[data-testid="tab-bar"] > div').filter({
    has: page.locator('span').filter({ hasText: tabLabel }),
  })
  if ((await tab.count()) === 0) return

  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await tab.count()) === 0) return
    await tab.first().click({ force: true })
    await tab.first().locator('button').last().click({ force: true })
    await page.waitForTimeout(350)
  }
  await expect(tab).toHaveCount(0, { timeout: 10_000 })
}

export async function closeAllTabs(page: Page): Promise<void> {
  const tabBar = page.locator('[data-testid="tab-bar"]')
  for (let guard = 0; guard < 40; guard++) {
    const tabs = tabBar.locator(':scope > div')
    if ((await tabs.count()) === 0) return

    await page.keyboard.press('Escape')
    const firstTab = tabs.first()
    await firstTab.click({ button: 'right', force: true })
    const closeAll = page.locator('.metamates-context-menu').getByText(/关闭全部|Close All/i)
    if (await closeAll.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeAll.click()
      await expect(tabs).toHaveCount(0, { timeout: 10_000 })
      return
    }

    await page.keyboard.press('Escape')
    const closeBtn = firstTab.getByRole('button', { name: /close/i })
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true })
    }
    await page.waitForTimeout(250)
  }
  await expect(tabBar.locator(':scope > div')).toHaveCount(0, { timeout: 5_000 })
}
