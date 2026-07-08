import { expect, type Page } from '@playwright/test'

function asRegex(name: string): RegExp {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

export async function refreshFileTree(page: Page): Promise<void> {
  await page.locator('[data-testid="file-tree"]').getByRole('button', { name: /sync/i }).click()
  await page.waitForTimeout(1200)
}

export async function ensureFolderExpanded(page: Page, folderName: string): Promise<void> {
  const row = page.getByRole('treeitem', { name: asRegex(folderName) }).first()
  await expect(row).toBeVisible()
  for (let attempt = 0; attempt < 3; attempt++) {
    const expanded = await row.getAttribute('aria-expanded')
    if (expanded === 'true') return
    await row.locator('.ant-tree-switcher').first().click({ force: true })
    await page.waitForTimeout(350)
  }
  await expect(row).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 })
}

export async function openFileFromTree(page: Page, fileName: string): Promise<void> {
  await page.locator('.ant-tree-title').filter({ hasText: fileName }).first().click()
}

/** Expand ancestors, sync, and retry collapse/expand until a file title appears in the tree. */
export async function ensureTreeFileVisible(
  page: Page,
  fileName: string,
  parentFolders: string[],
): Promise<void> {
  const baseName = fileName.replace(/\.md$/i, '')
  const fileTitle = page
    .locator('[data-testid="file-tree"] .ant-tree-title')
    .filter({ hasText: asRegex(baseName) })

  for (let attempt = 0; attempt < 4; attempt++) {
    await refreshFileTree(page)
    for (const folder of parentFolders) {
      await ensureFolderExpanded(page, folder)
    }
    if (await fileTitle.first().isVisible().catch(() => false)) return

    const innerFolder = parentFolders[parentFolders.length - 1]
    if (!innerFolder) continue

    const row = page.getByRole('treeitem', { name: asRegex(innerFolder) }).first()
    const switcher = row.locator('.ant-tree-switcher').first()
    const expanded = await row.getAttribute('aria-expanded')
    if (expanded === 'true') {
      await switcher.click({ force: true })
      await expect(row).toHaveAttribute('aria-expanded', 'false')
    }
    await switcher.click({ force: true })
    await expect(row).toHaveAttribute('aria-expanded', 'true')
  }

  await expect(fileTitle.first()).toBeVisible({ timeout: 20_000 })
}

export async function dragTreeFileToFolder(page: Page, fileName: string, folderName: string): Promise<void> {
  const sourceNode = page
    .locator('[data-testid="file-tree"] .ant-tree-treenode-draggable')
    .filter({ hasText: asRegex(fileName) })
    .first()
  const targetNode = page
    .locator('[data-testid="file-tree"] .ant-tree-treenode')
    .filter({ has: page.locator('.ant-tree-title').filter({ hasText: asRegex(folderName) }) })
    .first()

  await expect(sourceNode).toBeVisible({ timeout: 15_000 })
  await expect(targetNode).toBeVisible({ timeout: 15_000 })

  await sourceNode.locator('.ant-tree-node-content-wrapper').dragTo(
    targetNode.locator('.ant-tree-node-content-wrapper'),
    { targetPosition: { x: 16, y: 12 }, force: true },
  )
  await page.waitForTimeout(1000)
}
