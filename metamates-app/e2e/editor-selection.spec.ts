import { test, expect } from '@playwright/test'

test.describe('Editor Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
  })

  test('should show single line selection', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.click()
    
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Shift')
    
    const selectionBg = page.locator('.cm-selectionBackground')
    const count = await selectionBg.count()
    console.log('Single line selection elements:', count)
    
    if (count > 0) {
      const bgColor = await selectionBg.first().evaluate(el => 
        window.getComputedStyle(el).backgroundColor
      )
      console.log('Selection background color:', bgColor)
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(bgColor).not.toBe('transparent')
    }
    
    expect(count).toBeGreaterThan(0)
  })

  test('should show multi-line selection', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.click()
    
    await page.keyboard.down('Shift')
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.up('Shift')
    
    await page.waitForTimeout(500)
    
    const selectionBg = page.locator('.cm-selectionBackground')
    const count = await selectionBg.count()
    console.log('Multi-line selection elements:', count)
    
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        const el = selectionBg.nth(i)
        const bgColor = await el.evaluate(el => 
          window.getComputedStyle(el).backgroundColor
        )
        console.log(`Selection ${i} background color:`, bgColor)
        expect(bgColor).not.toBe('rgba(0, 0, 0, 0)')
        expect(bgColor).not.toBe('transparent')
      }
    }
    
    expect(count).toBeGreaterThan(0)
  })

  test('should have visible selection style in CSS', async ({ page }) => {
    const styles = await page.evaluate(() => {
      const styleSheets = document.styleSheets
      const results: string[] = []
      
      for (const sheet of styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules
          for (const rule of rules) {
            if (rule.cssText.includes('cm-selectionBackground')) {
              results.push(rule.cssText)
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
        }
      }
      return results
    })
    
    console.log('Selection CSS rules found:')
    styles.forEach(s => console.log(s))
    
    expect(styles.length).toBeGreaterThan(0)
  })
})
