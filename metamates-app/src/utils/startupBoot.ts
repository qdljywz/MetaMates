import { applyThemeBootstrapToDocument } from './themeBootstrap'

/** Boot phase: keep splash chrome stable (matches preset) until shell is ready. */
export const STARTUP_BOOT_ATTR = 'data-boot'
export const STARTUP_BOOT_FINISHED_EVENT = 'metamates:boot-finished'

export function isStartupBootPhase(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(STARTUP_BOOT_ATTR)
}

export function enableStartupBootPhase(): void {
  document.documentElement.setAttribute(STARTUP_BOOT_ATTR, 'true')
}

/**
 * Drop the HTML #boot-splash once React StartupSplash has painted.
 * Keep data-boot so light theme does not flash cream chrome under the React splash.
 * (HTML splash is SVG-only; the filled logo.png lives on React StartupSplash.)
 */
export function handoffHtmlBootSplash(): void {
  if (typeof document === 'undefined') return
  document.getElementById('boot-splash')?.remove()
}

/**
 * End boot phase: clear data-boot and apply the real theme to document chrome.
 * Call when leaving StartupSplash — not when handing off HTML → React splash.
 *
 * Prefer showing the shell under data-boot first (App sets loading=false before this),
 * then call this so light theme applies onto an already-mounted shell — not an empty cream void.
 */
export function finishStartupBootPhase(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.removeAttribute(STARTUP_BOOT_ATTR)
      document.getElementById('boot-splash')?.remove()
      applyThemeBootstrapToDocument()
      try {
        window.dispatchEvent(new Event(STARTUP_BOOT_FINISHED_EVENT))
      } catch {
        // jsdom / non-DOM hosts may lack EventTarget.dispatchEvent
      }
    })
  })
}
