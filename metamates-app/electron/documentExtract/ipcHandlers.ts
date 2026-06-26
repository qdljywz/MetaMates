import { ipcMain } from 'electron'
import { getCurrentWorkspacePath } from '../shared/workspaceState'
import { getDocumentFormat, isImportableDocument } from '../shared/importableFormats'
import { detectWorkspaceLanguage } from '../workspaceLayout'
import { prepareIntelligenceImport } from './prepareImport'
import { prepareUrlIntelligenceImport } from './prepareUrlImport'

/**
 * 注册文档提取与情报导入 IPC
 */
export function registerDocumentExtractHandlers(): void {
  ipcMain.handle('prepare-intelligence-import', async (_event, sourcePath: string) => {
    const workspacePath = getCurrentWorkspacePath()
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' }
    }
    const language = detectWorkspaceLanguage(workspacePath)
    return prepareIntelligenceImport(workspacePath, sourcePath, language)
  })

  ipcMain.handle('prepare-intelligence-url', async (_event, rawUrl: string) => {
    return prepareUrlIntelligenceImport(rawUrl)
  })

  ipcMain.handle('is-importable-document', async (_event, filePath: string) => {
    const format = getDocumentFormat(filePath)
    return { importable: isImportableDocument(filePath), format }
  })
}
