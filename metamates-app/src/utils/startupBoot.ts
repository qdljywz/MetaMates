/** Boot phase: force dark splash + disable theme transitions until shell is ready. */
export const STARTUP_BOOT_ATTR = 'data-boot'
export const STARTUP_BOOT_FINISHED_EVENT = 'metamates:boot-finished'

export function isStartupBootPhase(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(STARTUP_BOOT_ATTR)
}

export function enableStartupBootPhase(): void {
  document.documentElement.setAttribute(STARTUP_BOOT_ATTR, 'true')
}

export function finishStartupBootPhase(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.removeAttribute(STARTUP_BOOT_ATTR)
      document.getElementById('boot-splash')?.remove()
      window.dispatchEvent(new Event(STARTUP_BOOT_FINISHED_EVENT))
    })
  })
}
