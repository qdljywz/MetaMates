import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react'
import { storageService } from '../services/storage'
import { readThemeBootstrapSync, applyThemeBootstrapToDocument } from '../utils/themeBootstrap'

type ThemeMode = 'light' | 'dark' | 'system'
type ColorScheme = 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage'
type LightPalette = 'paper' | 'cold'

interface ThemeColors {
  primary: string
  background: string
  surface: string
  elevated: string
  text: string
  textSecondary: string
  border: string
  success: string
  warning: string
  error: string
  info: string
}

interface Theme {
  mode: 'light' | 'dark'
  lightPalette?: LightPalette
  colors: ThemeColors
}

const paperLightColors: ThemeColors = {
  primary: '#ff7a00',
  background: '#f0eeea',
  surface: '#f7f6f2',
  elevated: '#fcfaf6',
  text: '#18181b',
  textSecondary: '#3f3f46',
  border: 'rgba(0, 0, 0, 0.06)',
  success: '#16a34a',
  warning: '#ca8a04',
  error: '#dc2626',
  info: '#00b4a6',
}

const coldLightColors: ThemeColors = {
  primary: '#ff7a00',
  background: '#fafaf9',
  surface: '#ffffff',
  elevated: '#ffffff',
  text: '#18181b',
  textSecondary: '#3f3f46',
  border: 'rgba(0, 0, 0, 0.06)',
  success: '#16a34a',
  warning: '#ca8a04',
  error: '#dc2626',
  info: '#00b4a6',
}

const darkColors: ThemeColors = {
  primary: '#ff8c28',
  background: '#18181b',
  surface: '#1c1c1f',
  elevated: '#202024',
  text: '#fafafa',
  textSecondary: '#d4d4d8',
  border: 'rgba(255, 255, 255, 0.06)',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#00d4c4',
}

function resolveLightColors(palette: LightPalette): ThemeColors {
  return palette === 'cold' ? coldLightColors : paperLightColors
}

function readCssPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface ThemeContextType {
  theme: Theme
  themeMode: ThemeMode
  colorScheme: ColorScheme
  lightPalette: LightPalette
  setThemeMode: (mode: ThemeMode) => void
  setColorScheme: (scheme: ColorScheme) => void
  setLightPalette: (palette: LightPalette) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

function readInitialThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem('metamates-storage')
    if (!raw) return 'dark'
    const settings = (JSON.parse(raw) as { settings?: { theme?: string } }).settings
    const mode = settings?.theme
    if (mode === 'light' || mode === 'dark' || mode === 'system') return mode
  } catch {
    /* ignore */
  }
  return 'dark'
}

function readInitialLightPalette(): LightPalette {
  try {
    const raw = localStorage.getItem('metamates-storage')
    if (!raw) return 'paper'
    const settings = (JSON.parse(raw) as { settings?: { lightPalette?: string } }).settings
    return settings?.lightPalette === 'cold' ? 'cold' : 'paper'
  } catch {
    return 'paper'
  }
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  const boot = readThemeBootstrapSync()
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default')
  const [lightPalette, setLightPalette] = useState<LightPalette>(readInitialLightPalette)
  const [osPrefersDark, setOsPrefersDark] = useState(readCssPrefersDark)
  const [initialized, setInitialized] = useState(false)
  const skipHydrationSaveRef = useRef(true)

  const [theme, setTheme] = useState<Theme>(() => ({
    mode: boot.mode,
    lightPalette: boot.mode === 'light' ? boot.lightPalette : undefined,
    colors: boot.mode === 'dark' ? darkColors : resolveLightColors(boot.lightPalette),
  }))

  useEffect(() => {
    const loadThemeSettings = async () => {
      try {
        const settings = await storageService.getSettings()
        const mode = (settings.theme as ThemeMode) || 'dark'
        const scheme = (settings.colorScheme as ColorScheme) || 'default'
        const palette = settings.lightPalette === 'cold' ? 'cold' : 'paper'

        if (mode !== 'light' && mode !== 'dark' && mode !== 'system') {
          setThemeMode('dark')
        } else {
          setThemeMode(mode)
        }
        setColorScheme(scheme)
        setLightPalette(palette)
      } catch {
        setThemeMode('dark')
        setColorScheme('default')
        setLightPalette('paper')
      }
      setInitialized(true)
    }
    loadThemeSettings()
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (document.documentElement.hasAttribute('data-boot')) return
    window.electronAPI?.setNativeThemeSource?.(themeMode).catch(() => {})
  }, [themeMode, initialized])

  useEffect(() => {
    if (themeMode !== 'system') return

    const api = window.electronAPI
    if (api?.getNativeColorScheme) {
      api.getNativeColorScheme()
        .then((scheme) => setOsPrefersDark(scheme.shouldUseDarkColors))
        .catch(() => setOsPrefersDark(readCssPrefersDark()))

      const unsubscribe = api.onNativeColorSchemeChanged?.((scheme) => {
        setOsPrefersDark(scheme.shouldUseDarkColors)
      })
      return unsubscribe
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOsPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [themeMode])

  const applyTheme = useCallback(() => {
    if (typeof document !== 'undefined' && document.documentElement.hasAttribute('data-boot')) {
      applyThemeBootstrapToDocument()
      return
    }

    const mode = themeMode === 'system'
      ? (osPrefersDark ? 'dark' : 'light')
      : themeMode

    const colors = mode === 'dark' ? darkColors : resolveLightColors(lightPalette)

    setTheme({
      mode,
      lightPalette: mode === 'light' ? lightPalette : undefined,
      colors,
    })

    document.documentElement.setAttribute('data-theme', mode)
    document.documentElement.setAttribute('data-color-scheme', colorScheme)
    if (mode === 'light') {
      document.documentElement.setAttribute('data-light-palette', lightPalette)
    } else {
      document.documentElement.removeAttribute('data-light-palette')
    }
    document.body.style.background = colors.background
    document.body.style.color = colors.text
  }, [themeMode, colorScheme, lightPalette, osPrefersDark])

  useEffect(() => {
    applyTheme()
  }, [applyTheme])

  useEffect(() => {
    const syncAfterBoot = () => applyTheme()
    window.addEventListener('metamates:boot-finished', syncAfterBoot)
    return () => window.removeEventListener('metamates:boot-finished', syncAfterBoot)
  }, [applyTheme])

  useEffect(() => {
    if (!initialized) return
    if (skipHydrationSaveRef.current) {
      skipHydrationSaveRef.current = false
      return
    }
    try {
      storageService.saveSettings({
        theme: themeMode,
        colorScheme,
        lightPalette,
      })
    } catch (error) {
      console.error('Failed to save theme settings:', error)
    }
  }, [themeMode, colorScheme, lightPalette, initialized])

  const toggleTheme = () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system']
    const currentIndex = modes.indexOf(themeMode)
    const nextIndex = (currentIndex + 1) % modes.length
    setThemeMode(modes[nextIndex])
  }

  return (
    <ThemeContext.Provider value={{
      theme,
      themeMode,
      colorScheme,
      lightPalette,
      setThemeMode,
      setColorScheme,
      setLightPalette,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export { paperLightColors as lightColors, coldLightColors, darkColors }
export type { Theme, ThemeColors, ThemeMode, ColorScheme, LightPalette }
