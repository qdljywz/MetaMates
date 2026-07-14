import { expect, type Page } from '@playwright/test'

export async function openSettingsModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.locator('[data-testid="settings-button"]').click()
  const modal = page.locator('.ant-modal-wrap').filter({
    has: page.locator('.ant-modal').filter({ hasText: /设置|Settings/i }),
  })
  await expect(modal).toBeVisible({ timeout: 15_000 })
}

export function settingsModalLocator(page: Page) {
  return page.locator('.ant-modal-wrap').filter({
    has: page.locator('.ant-modal').filter({ hasText: /设置|Settings/i }),
  })
}

export async function openSettingsTab(
  page: Page,
  tab: 'general' | 'agent' | 'advanced',
): Promise<void> {
  await openSettingsModal(page)
  const modal = settingsModalLocator(page)
  const pattern =
    tab === 'general' ? /General|常用/ : tab === 'agent' ? /AI 助手|AI assistants/i : /Advanced|高级/
  await modal.getByRole('tab', { name: pattern }).click({ force: true })
  if (tab === 'agent') {
    await page.locator('[data-testid="settings-agent-tab"]').waitFor({ state: 'visible', timeout: 10_000 })
  }
}

export async function closeTopModal(page: Page): Promise<void> {
  const wrap = page.locator('.ant-modal-wrap:visible')
  if ((await wrap.count()) === 0) {
    await page.keyboard.press('Escape')
    return
  }
  await page.keyboard.press('Escape')
  await expect(wrap.first()).toBeHidden({ timeout: 10_000 }).catch(() => {})
}

/** Sections should be visibly separated (not stacked with zero gap). */
export async function expectSettingsSectionsSpaced(page: Page, minSections: number): Promise<void> {
  const sections = page.locator('.settings-section')
  await expect(async () => {
    expect(await sections.count()).toBeGreaterThanOrEqual(minSections)
  }).toPass({ timeout: 8_000, intervals: [300] })

  const count = await sections.count()
  if (count < 2) return

  const first = await sections.nth(0).boundingBox()
  const second = await sections.nth(1).boundingBox()
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  expect(second!.y).toBeGreaterThan(first!.y + 8)
}

export async function expectShellChrome(page: Page): Promise<void> {
  for (const id of ['help-button', 'settings-button', 'github-button', 'minimize-button', 'maximize-button']) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible({ timeout: 10_000 })
  }
  await expect(page.locator('.status-bar')).toBeVisible()
  await expect(page.locator('[data-testid="file-tree"]')).toBeVisible()
  await expect(page.locator('[data-testid="agent-panel"]')).toBeVisible()
}

export async function expectActivityBarItems(page: Page): Promise<void> {
  const keys = [
    'toggle',
    'workspace',
    'newNote',
    'newFolder',
    'template',
    'commandPalette',
    'graph',
    'search',
  ]
  for (const key of keys) {
    await expect(page.locator(`[data-testid="activity-${key}"]`)).toBeVisible({ timeout: 10_000 })
  }
}

export async function expectAgentPanelControls(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="agent-toolbar"]')).toBeVisible()
  await expect(page.locator('[data-testid="acp-connection-status"]')).toBeVisible()
  await expect(page.locator('[data-testid="chat-input"]')).toBeVisible()
  await expect(page.locator('[data-testid="send-button"]')).toBeVisible()
  await expect(page.locator('[data-testid="voice-button"]')).toBeVisible()
  await expect(page.locator('[data-testid="agent-mode-select"]')).toBeVisible()

  const sidebars = page.locator('[data-testid^="agent-sidebar-"]')
  await expect(async () => {
    expect(await sidebars.count()).toBeGreaterThan(0)
  }).toPass({ timeout: 15_000, intervals: [500] })
}
