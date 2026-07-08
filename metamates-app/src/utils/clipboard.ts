/** Copy text in Electron renderer (clipboard API + fallbacks). */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text?.trim() ? text : ''
  if (!value) return false

  const api = window.electronAPI as { writeClipboardText?: (t: string) => boolean } | undefined
  if (api?.writeClipboardText) {
    try {
      api.writeClipboardText(value)
      return true
    } catch {
      // fall through
    }
  }

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      return ok
    } catch {
      return false
    }
  }
}
