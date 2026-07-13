import { nativeTheme, ipcMain, BrowserWindow } from 'electron'

export type ThemeSourceMode = 'light' | 'dark' | 'system'

export interface NativeColorScheme {
  shouldUseDarkColors: boolean
  shouldUseHighContrastColors: boolean
  shouldUseInvertedColorScheme: boolean
}

function readNativeColorScheme(): NativeColorScheme {
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
    shouldUseInvertedColorScheme: nativeTheme.shouldUseInvertedColorScheme,
  }
}

function broadcastNativeColorScheme(): void {
  const payload = readNativeColorScheme()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('native-color-scheme-changed', payload)
    }
  }
}

/** Align Electron chrome with user theme preference (light / dark / system). */
export function syncNativeThemeSource(themeMode: ThemeSourceMode): void {
  nativeTheme.themeSource = themeMode
}

export function registerNativeThemeBridge(): void {
  ipcMain.handle('get-native-color-scheme', () => readNativeColorScheme())

  ipcMain.handle('set-native-theme-source', (_event, themeMode: ThemeSourceMode) => {
    syncNativeThemeSource(themeMode)
    return { success: true }
  })

  nativeTheme.on('updated', broadcastNativeColorScheme)
}
