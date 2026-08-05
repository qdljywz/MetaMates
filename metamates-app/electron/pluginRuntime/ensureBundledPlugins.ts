import { app } from 'electron'
import { DOCUMENT_IMPORT_PLUGIN_ID, OFFLINE_SPEECH_PLUGIN_ID } from './pluginManifest'
import { installPluginPreferLocal } from './pluginInstaller'
import { getPluginRoot, isPluginRootReady, resolveBundledPluginZip } from './pluginPaths'

const BUNDLED_PLUGIN_IDS = [DOCUMENT_IMPORT_PLUGIN_ID, OFFLINE_SPEECH_PLUGIN_ID] as const

/**
 * Install document-import + offline-speech from bundled plugin-zips into userData.
 *
 * UX-35: NOT called on normal packaged startup (on-demand via Settings / install toast).
 * Kept for opt-in CI smoke: set METAMATES_INSTALL_BUNDLED_PLUGINS=1.
 */
export async function ensureBundledPluginsInstalled(): Promise<void> {
  if (!app.isPackaged) return
  if (process.env.METAMATES_INSTALL_BUNDLED_PLUGINS !== '1') return
  if (process.env.METAMATES_SKIP_BUNDLED_PLUGINS === '1') return

  for (const pluginId of BUNDLED_PLUGIN_IDS) {
    const installedRoot = getPluginRoot(pluginId)
    if (isPluginRootReady(installedRoot)) continue

    const zip = resolveBundledPluginZip(pluginId)
    if (!zip) {
      console.warn(`[Plugin] Bundled zip missing for ${pluginId} — skip auto-install`)
      continue
    }

    console.log(`[Plugin] Installing bundled ${pluginId} from ${zip} (opt-in METAMATES_INSTALL_BUNDLED_PLUGINS=1)`)
    const result = await installPluginPreferLocal(pluginId)
    if (result.success) {
      console.log(`[Plugin] Installed ${pluginId} (${result.source ?? 'unknown'})`)
    } else {
      console.warn(`[Plugin] Install failed for ${pluginId}: ${result.error}`)
    }
  }
}
