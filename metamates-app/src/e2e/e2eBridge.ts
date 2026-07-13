import { archiveProcessedInboxNotes } from '../services/graduateInboxArchive'
import { getWorkspaceLanguage } from '../constants/paths'
import { openSlashWritebackInEditor, pruneMissingOpenTabs } from '../utils/openSlashWriteback'
import { workspaceIndexService } from '../services/workspaceIndex'
import type { AppAction } from '../store/appStore'

type E2EWindow = Window & {
  __METAMATES_E2E__?: {
    enabled?: boolean
    workspace?: string
    registerSimulateGraduateArchive?: (
      fn: ((
        payload: { sourceTexts?: string[]; explicitPaths?: string[] },
      ) => Promise<{ moved: string[]; skipped: string[] }>) | null,
    ) => void
    registerSimulateSlashWritebackOpen?: (
      fn: ((cmdId: string) => Promise<string | null>) | null,
    ) => void
    registerSetAutoSave?: (fn: ((enabled: boolean) => void) | null) => void
    registerSimulateExternalFileRemoved?: (fn: ((filePath: string) => Promise<void>) | null) => void
  }
}

/**
 * Register E2E-only hooks (no-op outside __METAMATES_E2E__.enabled).
 */
export function registerE2EBridge(options: {
  workspacePath: string | null
  language: string
  dispatch: (action: AppAction) => void
  setAutoSave: (enabled: boolean) => void
  onExternalFileRemoved: (filePath: string) => Promise<void>
}): () => void {
  const w = window as E2EWindow
  const e2e = w.__METAMATES_E2E__
  if (!e2e?.enabled) return () => {}

  ;(w as E2EWindow & { __metamatesE2EDispatch?: (action: AppAction) => void }).__metamatesE2EDispatch =
    options.dispatch

  e2e.registerSimulateGraduateArchive?.(async (payload) => {
    const ws = options.workspacePath || e2e.workspace || ''
    if (!ws) return { moved: [], skipped: [] }
    const sourceTexts = Array.isArray(payload)
      ? payload
      : payload?.sourceTexts
    const explicitPaths = Array.isArray(payload) ? [] : payload?.explicitPaths
    const result = await archiveProcessedInboxNotes({
      workspacePath: ws,
      language: getWorkspaceLanguage(options.language),
      sourceTexts,
      explicitPaths,
    })
    if (result.moved.length > 0) {
      window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
    }
    return result
  })

  e2e.registerSimulateSlashWritebackOpen?.(async (cmdId) => {
    const ws = options.workspacePath || e2e.workspace || ''
    if (!ws) return null
    return openSlashWritebackInEditor({
      cmdId,
      workspacePath: ws,
      language: getWorkspaceLanguage(options.language),
      dispatch: options.dispatch,
    })
  })

  e2e.registerSetAutoSave?.((enabled) => {
    options.setAutoSave(enabled)
  })

  e2e.registerSimulateExternalFileRemoved?.(async (filePath) => {
    await options.onExternalFileRemoved(filePath)
    const ws = options.workspacePath || e2e.workspace || ''
    if (!ws) return
    await pruneMissingOpenTabs({
      workspacePath: ws,
      tabPaths: [filePath],
      dispatch: options.dispatch,
    })
  })

  return () => {
    e2e.registerSimulateGraduateArchive?.(null)
    e2e.registerSimulateSlashWritebackOpen?.(null)
    e2e.registerSetAutoSave?.(null)
    e2e.registerSimulateExternalFileRemoved?.(null)
    delete (w as E2EWindow & { __metamatesE2EDispatch?: (action: AppAction) => void }).__metamatesE2EDispatch
  }
}
