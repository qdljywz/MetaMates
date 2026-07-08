import { expect, type Page } from '@playwright/test'

async function syncTree(page: Page): Promise<void> {
  await page.locator('[data-testid="file-tree"]').getByRole('button', { name: /sync/i }).click().catch(() => {})
  await page.waitForTimeout(600)
}

export async function rightClickTreeTitle(page: Page, name: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.keyboard.press('Escape')
    const title = page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: name }).first()
    if (await title.isVisible().catch(() => false)) {
      try {
        await title.click({ button: 'right', timeout: 5_000 })
        return
      } catch {
        // tree may be rebuilding
      }
    }
    await syncTree(page)
  }
  throw new Error(`Could not right-click tree title: ${name}`)
}

export async function pickContextMenuItem(page: Page, label: RegExp): Promise<void> {
  await page.locator('.metamates-context-menu .ant-menu-item').filter({ hasText: label }).first().click()
}
