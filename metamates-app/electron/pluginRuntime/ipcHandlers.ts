import { ipcMain } from 'electron'
import { getDocumentImportPluginStatus } from './documentImportPlugin'
import { getOfflineSpeechPluginStatus } from './offlineSpeechPlugin'
import {
  installDocumentImportFromGitHub,
  installOfflineSpeechFromGitHub,
  installPluginFromDirectory,
  uninstallPlugin,
} from './pluginInstaller'
import { DOCUMENT_IMPORT_PLUGIN_ID, OFFLINE_SPEECH_PLUGIN_ID } from './pluginManifest'
import { listInstalledPluginIds } from './pluginPaths'
import * as path from 'path'
import { getAppRoot } from '../shared/appPaths'

export function registerPluginHandlers(): void {
  ipcMain.handle('get-document-import-plugin-status', () => getDocumentImportPluginStatus())
  ipcMain.handle('get-offline-speech-plugin-status', () => getOfflineSpeechPluginStatus())

  ipcMain.handle('list-installed-plugins', () => ({
    plugins: listInstalledPluginIds(),
  }))

  ipcMain.handle('install-document-import-plugin', async (_event, options?: { version?: string; fromDev?: boolean }) => {
    if (options?.fromDev) {
      const devDir = path.join(getAppRoot(), 'plugins', DOCUMENT_IMPORT_PLUGIN_ID)
      return installPluginFromDirectory(devDir, DOCUMENT_IMPORT_PLUGIN_ID)
    }
    return installDocumentImportFromGitHub(options?.version)
  })

  ipcMain.handle('install-offline-speech-plugin', async (_event, options?: { version?: string; fromDev?: boolean }) => {
    if (options?.fromDev) {
      const devDir = path.join(getAppRoot(), 'plugins', OFFLINE_SPEECH_PLUGIN_ID)
      return installPluginFromDirectory(devDir, OFFLINE_SPEECH_PLUGIN_ID)
    }
    return installOfflineSpeechFromGitHub(options?.version)
  })

  ipcMain.handle('uninstall-plugin', async (_event, pluginId: string) => uninstallPlugin(pluginId))
}
