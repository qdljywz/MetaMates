import { test, expect } from '@playwright/test'

test('dev server renders app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
