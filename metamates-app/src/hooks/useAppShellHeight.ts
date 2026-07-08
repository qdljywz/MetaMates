import { useEffect } from 'react'

/** Keep document height aligned with Electron/BrowserWindow client area (avoids 100vh gap). */
export function useAppShellHeight(): void {
  useEffect(() => {
    const sync = () => {
      const height = `${window.innerHeight}px`
      document.documentElement.style.setProperty('--app-shell-height', height)
      document.documentElement.style.height = height
      document.body.style.height = height
    }

    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])
}
