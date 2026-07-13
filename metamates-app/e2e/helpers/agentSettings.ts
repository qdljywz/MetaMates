import type { Page } from '@playwright/test'

/** Open Settings modal on the Agent tab. */
export async function openSettingsAgentTab(page: Page): Promise<void> {
  await page.locator('[data-testid="settings-button"]').click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('tab', { name: /AI 助手|AI assistants/i }).click()
  await page.locator('[data-testid="settings-agent-tab"]').waitFor({ state: 'visible', timeout: 10_000 })
}

export async function selectAgentSidebar(page: Page, backend: string): Promise<boolean> {
  const btn = page.locator(`[data-testid="agent-sidebar-${backend}"]`)
  if ((await btn.count()) === 0) return false
  await btn.click({ force: true })
  return true
}

export async function waitForConnectionStatus(
  page: Page,
  allowed: string[],
  timeoutMs = 45_000,
): Promise<string | null> {
  const status = page.locator('[data-testid="acp-connection-status"]')
  let last: string | null = null
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    last = await status.getAttribute('data-status')
    if (last && allowed.includes(last)) return last
    await page.waitForTimeout(500)
  }
  return last
}
