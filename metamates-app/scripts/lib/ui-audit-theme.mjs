import { dismissBlockingModals } from './electron-e2e-lifecycle.mjs'

export async function bootstrapAuditTheme(win, mode, options = {}) {
  const lightPalette = options.lightPalette === 'cold' ? 'cold' : 'paper'
  await win.evaluate(async ({ themeMode, palette }) => {
    const api = window.electronAPI
    const storageKey = 'metamates-storage'
    const stored = localStorage.getItem(storageKey)
    const data = stored
      ? JSON.parse(stored)
      : { settings: {}, workspace: { currentFile: '', openFiles: [], editorState: {} }, commandHistory: [], version: '1.0.0' }
    data.settings = {
      ...data.settings,
      theme: themeMode,
      colorScheme: 'default',
      lightPalette: palette,
    }
    localStorage.setItem(storageKey, JSON.stringify(data))
    if (api?.saveSettings) {
      await api.saveSettings({ theme: themeMode, colorScheme: 'default', lightPalette: palette })
    }
  }, { themeMode: mode, palette: lightPalette })

  await win.reload({ waitUntil: 'domcontentloaded' })
  await win.waitForSelector('[data-testid="agent-toolbar"]', { timeout: 120_000 }).catch(() => {})
  if (mode === 'light' || mode === 'dark') {
    await win.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      mode,
      { timeout: 60_000 },
    )
  }
  if (mode === 'light') {
    await win.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-light-palette') === expected,
      lightPalette,
      { timeout: 30_000 },
    )
  }
  await dismissBlockingModals(win)
}
