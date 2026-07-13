import { app } from 'electron'
import { DOCUMENT_IMPORT_PLUGIN_ID, OFFLINE_SPEECH_PLUGIN_ID } from './pluginManifest'
import { installPluginPreferLocal } from './pluginInstaller'
import { getPluginRoot, isPluginRootReady, resolveBundledPluginZip } from './pluginPaths'

const BUNDLED_PLUGIN_IDS = [DOCUMENT_IMPORT_PLUGIN_ID, OFFLINE_SPEECH_PLUGIN_ID] as const

/**
 * Portable / packaged first run: install document-import + offline-speech from
 * bundled plugin-zips into userData/plugins so PDF/OCR and Whisper work without GitHub.
 */
export async function ensureBundledPluginsInstalled(): Promise<void> {
  if (!app.isPackaged) return
  if (process.env.METAMATES_E2E === '1' && process.env.METAMATES_E2E_ALLOW_BUNDLED_PLUGINS !== '1') return
  if (process.env.METAMATES_SKIP_BUNDLED_PLUGINS === '1') return

  for (const pluginId of BUNDLED_PLUGIN_IDS) {
    const installedRoot = getPluginRoot(pluginId)
    if (isPluginRootReady(installedRoot)) continue

    const zip = resolveBundledPluginZip(pluginId)
    if (!zip) {
      console.warn(`[Plugin] Bundled zip missing for ${pluginId} — skip auto-install`)
      continue
    }

    console.log(`[Plugin] Auto-installing bundled ${pluginId} from ${zip}`)
    const result = await installPluginPreferLocal(pluginId)
    if (result.success) {
      console.log(`[Plugin] Installed ${pluginId} (${result.source ?? 'unknown'})`)
    } else {
      console.warn(`[Plugin] Auto-install failed for ${pluginId}: ${result.error}`)
    }
  }
}
