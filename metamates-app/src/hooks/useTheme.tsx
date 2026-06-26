import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { storageService } from '../services/storage'

type ThemeMode = 'light' | 'dark' | 'system'
type ColorScheme = 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage'

interface ThemeColors {
  primary: string
  background: string
  surface: string
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
  colors: ThemeColors
}

const lightColors: ThemeColors = {
  primary: '#ff7a00',
  background: '#fafafa',
  surface: '#ffffff',
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
  text: '#fafafa',
  textSecondary: '#d4d4d8',
  border: 'rgba(255, 255, 255, 0.06)',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#00d4c4',
}

interface ThemeContextType {
  theme: Theme
  themeMode: ThemeMode
  colorScheme: ColorScheme
  setThemeMode: (mode: ThemeMode) => void
  setColorScheme: (scheme: ColorScheme) => void
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

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default')
  const [initialized, setInitialized] = useState(false)

  const [theme, setTheme] = useState<Theme>(() => {
    return {
      mode: 'dark',
      colors: darkColors
    }
  })

  useEffect(() => {
    const loadThemeSettings = async () => {
      try {
        const settings = await storageService.getSettings()
        const mode = (settings.theme as ThemeMode) || 'dark'
        const scheme = (settings.colorScheme as ColorScheme) || 'default'
        
        if (mode !== 'light' && mode !== 'dark' && mode !== 'system') {
          setThemeMode('dark')
        } else {
          setThemeMode(mode)
        }
        setColorScheme(scheme)
      } catch {
        setThemeMode('dark')
        setColorScheme('default')
      }
      setInitialized(true)
    }
    loadThemeSettings()
  }, [])

  useEffect(() => {
    const updateTheme = () => {
      const mode = themeMode === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : themeMode

      setTheme({
        mode,
        colors: mode === 'dark' ? darkColors : lightColors
      })

      document.documentElement.setAttribute('data-theme', mode)
      document.documentElement.setAttribute('data-color-scheme', colorScheme)
      document.body.style.background = mode === 'dark' ? darkColors.background : lightColors.background
      document.body.style.color = mode === 'dark' ? darkColors.text : lightColors.text
    }

    updateTheme()

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', updateTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateTheme)
    }
  }, [themeMode, colorScheme])

  useEffect(() => {
    if (!initialized) return
    try {
      storageService.saveSettings({ 
        theme: themeMode === 'system' ? 'dark' : themeMode,
        colorScheme 
      })
    } catch (error) {
      console.error('Failed to save theme settings:', error)
    }
  }, [themeMode, colorScheme, initialized])

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
      setThemeMode, 
      setColorScheme,
      toggleTheme 
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function getThemeStyles(theme: Theme): Record<string, string> {
  return {
    '--primary-color': theme.colors.primary,
    '--background-color': theme.colors.background,
    '--surface-color': theme.colors.surface,
    '--text-color': theme.colors.text,
    '--text-secondary-color': theme.colors.textSecondary,
    '--border-color': theme.colors.border,
    '--success-color': theme.colors.success,
    '--warning-color': theme.colors.warning,
    '--error-color': theme.colors.error,
    '--info-color': theme.colors.info,
  }
}

export { lightColors, darkColors }
export type { Theme, ThemeColors, ThemeMode, ColorScheme }
