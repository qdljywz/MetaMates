import { type Page } from '@playwright/test'

async function syncTree(page: Page): Promise<void> {
  await page.locator('[data-testid="file-tree"]').getByRole('button', { name: /sync/i }).click().catch(() => {})
  await page.waitForTimeout(600)
}

function treeTitle(page: Page, name: string) {
  return page.locator('[data-testid="file-tree"] .ant-tree-title').filter({ hasText: name }).first()
}

function contextMenuItem(page: Page, label: RegExp) {
  return page.locator('.metamates-context-menu .ant-menu-item').filter({ hasText: label }).first()
}

/**
 * 右键文件树节点并选择菜单项；树刷新导致菜单 detach 时会自动重试。
 */
export async function contextMenuPickOnTreeTitle(
  page: Page,
  name: string,
  label: RegExp,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.keyboard.press('Escape')
    const title = treeTitle(page, name)
    if (!(await title.isVisible().catch(() => false))) {
      await syncTree(page)
      continue
    }
    try {
      await title.click({ button: 'right', timeout: 5_000 })
      const item = contextMenuItem(page, label)
      await item.waitFor({ state: 'visible', timeout: 3_000 })
      await item.click({ timeout: 5_000 })
      return
    } catch {
      await page.waitForTimeout(500)
    }
  }
  throw new Error(`Could not open context menu on "${name}" and pick ${label}`)
}

/** @deprecated 优先使用 contextMenuPickOnTreeTitle，避免菜单与树刷新竞态 */
export async function rightClickTreeTitle(page: Page, name: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.keyboard.press('Escape')
    const title = treeTitle(page, name)
    if (await title.isVisible().catch(() => false)) {
      try {
        await title.click({ button: 'right', timeout: 5_000 })
        const menuItem = page.locator('.metamates-context-menu .ant-menu-item').first()
        await menuItem.waitFor({ state: 'visible', timeout: 2_000 })
        return
      } catch {
        // tree or menu may be rebuilding
      }
    }
    await syncTree(page)
  }
  throw new Error(`Could not right-click tree title: ${name}`)
}

/** @deprecated 优先使用 contextMenuPickOnTreeTitle */
export async function pickContextMenuItem(page: Page, label: RegExp): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const item = contextMenuItem(page, label)
      await item.waitFor({ state: 'visible', timeout: 3_000 })
      await item.click({ timeout: 5_000 })
      return
    } catch {
      await page.waitForTimeout(400)
    }
  }
  throw new Error(`Could not pick context menu item: ${label}`)
}
