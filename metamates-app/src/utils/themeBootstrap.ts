/** Sync theme read for first paint — avoids dark flash before React/settings hydrate. */

export type BootstrapThemeMode = 'light' | 'dark'
export type BootstrapLightPalette = 'paper' | 'cold'

const STORAGE_KEY = 'metamates-storage'

export function readThemeBootstrapSync(): {
  mode: BootstrapThemeMode
  lightPalette: BootstrapLightPalette
  background: string
} {
  const fallback = { mode: 'dark' as const, lightPalette: 'paper' as const, background: '#18181b' }
  if (typeof window === 'undefined') return fallback

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const settings = (JSON.parse(raw) as { settings?: { theme?: string; lightPalette?: string } }).settings
    if (!settings) return fallback

    const lightPalette: BootstrapLightPalette = settings.lightPalette === 'cold' ? 'cold' : 'paper'
    const lightBg = lightPalette === 'cold' ? '#fafaf9' : '#f0eeea'
    const theme = settings.theme

    if (theme === 'light') {
      return { mode: 'light', lightPalette, background: lightBg }
    }
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      return prefersDark
        ? fallback
        : { mode: 'light', lightPalette, background: lightBg }
    }
    return fallback
  } catch {
    return fallback
  }
}

/** Apply saved theme to `<html>` / `<body>` before React mounts. */
export function applyThemeBootstrapToDocument(): void {
  if (typeof document === 'undefined') return

  const { mode, lightPalette, background } = readThemeBootstrapSync()
  const boot = document.documentElement.hasAttribute('data-boot')
  // During boot splash: remember intended theme on <html>, but keep chrome dark so
  // removing #boot-splash never flashes cream/white empty for a few seconds.
  const paintBg = boot ? '#18181b' : background
  const paintFg = boot ? '#fafafa' : mode === 'light' ? '#18181b' : '#fafafa'
  const paintScheme = boot ? 'dark' : mode

  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.setAttribute('data-color-scheme', 'default')
  if (mode === 'light') {
    document.documentElement.setAttribute('data-light-palette', lightPalette)
  } else {
    document.documentElement.removeAttribute('data-light-palette')
  }

  // Native <button> / form controls follow color-scheme — must match real theme or
  // light UI gets light ButtonText (白字贴白底，如活动日历「今天」).
  document.documentElement.style.colorScheme = paintScheme
  document.documentElement.style.backgroundColor = paintBg
  if (document.body) {
    document.body.style.backgroundColor = paintBg
    document.body.style.color = paintFg
  }
  const root = document.getElementById('root')
  if (root) root.style.backgroundColor = paintBg
}
