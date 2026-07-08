import { resolveSlashWriteTargetPaths } from '../commands/slashWritebackVerify'
import type { WorkspaceLanguage } from '../constants/paths'
import type { AppAction } from '../store/appStore'

function tabNameFromPath(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

/**
 * After verified slash writeback, open the first concrete file target in the editor.
 */
export async function openSlashWritebackInEditor(options: {
  cmdId: string
  workspacePath: string
  language: WorkspaceLanguage
  dispatch: (action: AppAction) => void
}): Promise<string | null> {
  const { cmdId, workspacePath, language, dispatch } = options
  const api = window.electronAPI
  if (!api?.path?.join || !api.fileExists) return null

  const relatives = resolveSlashWriteTargetPaths(cmdId, language).filter((rel) => !rel.endsWith('/'))
  for (const rel of relatives) {
    const abs = await api.path.join(workspacePath, rel.replace(/\\/g, '/'))
    const exists = await api.fileExists(abs)
    if (!exists?.exists) continue
    const name = tabNameFromPath(abs)
    dispatch({ type: 'ADD_TAB', payload: { path: abs, name, isDirty: false } })
    dispatch({ type: 'SET_CURRENT_FILE', payload: abs })
    return abs
  }
  return null
}

/**
 * Close editor tabs whose files no longer exist on disk (external delete/rename).
 */
export async function pruneMissingOpenTabs(options: {
  workspacePath: string
  tabPaths: string[]
  dispatch: (action: AppAction) => void
}): Promise<string[]> {
  const { workspacePath, tabPaths, dispatch } = options
  const api = window.electronAPI
  if (!api?.fileExists || !workspacePath?.trim()) return []

  const removed: string[] = []
  for (const tabPath of tabPaths) {
    if (!tabPath?.trim()) continue
    const exists = await api.fileExists(tabPath)
    if (exists?.exists) continue
    dispatch({ type: 'CLOSE_TAB', payload: tabPath })
    removed.push(tabPath)
  }
  return removed
}
