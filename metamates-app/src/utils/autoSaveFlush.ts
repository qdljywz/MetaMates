import { treePathsEqual } from './fileTreeExpand'

/** Flush debounced auto-save before closing a tab (autoSave ON — no unsaved prompt). */
export function flushPendingAutoSave(filePath?: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    window.dispatchEvent(
      new CustomEvent('metamates:flush-auto-save', { detail: { filePath, done } }),
    )
    window.setTimeout(() => done(false), 8_000)
  })
}

export function isClosingCurrentFile(filePath: string, currentFile: string | null | undefined): boolean {
  return Boolean(currentFile && treePathsEqual(filePath, currentFile))
}
