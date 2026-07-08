import { test, expect } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow } from './helpers/launchElectron'

test.describe('Startup shell layout', () => {
  test('status bar sits at bottom without skeleton placeholders below', async () => {
    const app = await launchMetaMatesApp()
    try {
      const page = await resolveMainWindow(app, { requireChatInput: false })

      const layout = await page.evaluate(() => {
        const status = document.querySelector('.status-bar') as HTMLElement | null
        const skeletons = document.querySelectorAll('.app-container .ant-skeleton')
        const appContainer = document.querySelector('.app-container') as HTMLElement | null
        const root = document.getElementById('root') as HTMLElement | null
        return {
          innerHeight: window.innerHeight,
          statusBottom: status?.getBoundingClientRect().bottom ?? 0,
          skeletonCount: skeletons.length,
          appContainerBottom: appContainer?.getBoundingClientRect().bottom ?? 0,
          rootHeight: root?.getBoundingClientRect().height ?? 0,
        }
      })

      expect(layout.skeletonCount).toBe(0)
      expect(layout.statusBottom).toBeGreaterThan(layout.innerHeight * 0.85)
      expect(Math.abs(layout.appContainerBottom - layout.innerHeight)).toBeLessThan(6)
      expect(Math.abs(layout.rootHeight - layout.innerHeight)).toBeLessThan(6)
    } finally {
      await closeElectronApp(app)
    }
  })
})
