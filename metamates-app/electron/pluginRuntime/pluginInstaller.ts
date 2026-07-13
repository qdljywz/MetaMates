import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import * as os from 'os'
import * as path from 'path'
import { app } from 'electron'
import { DOCUMENT_IMPORT_PLUGIN_ID, OFFLINE_SPEECH_PLUGIN_ID, pluginReleaseDownloadUrl, type PluginManifest } from './pluginManifest'
import { getPluginRoot, readBundledPluginManifest, readPluginManifest, resolveBundledPluginZip } from './pluginPaths'

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          fs.unlink(destPath, () => {})
          downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlink(destPath, () => {})
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      })
      .on('error', (err) => {
        file.close()
        fs.unlink(destPath, () => {})
        reject(err)
      })
  })
}

function extractZip(zipPath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'Expand-Archive failed')
    }
    return
  }
  const result = spawnSync('unzip', ['-o', zipPath, '-d', destDir], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'unzip failed')
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(from, to)
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

function removeDirRecursive(target: string): void {
  if (!fs.existsSync(target)) return
  fs.rmSync(target, { recursive: true, force: true })
}

function normalizeInstalledPluginLayout(extractRoot: string, pluginId: string): string {
  const direct = path.join(extractRoot, pluginId)
  if (fs.existsSync(path.join(direct, 'manifest.json'))) return direct

  if (fs.existsSync(path.join(extractRoot, 'manifest.json'))) return extractRoot

  const nested = fs
    .readdirSync(extractRoot, { withFileTypes: true })
    .find((d) => d.isDirectory() && fs.existsSync(path.join(extractRoot, d.name, 'manifest.json')))
  if (nested) return path.join(extractRoot, nested.name)

  throw new Error('Plugin archive does not contain manifest.json')
}

export async function installPluginFromDirectory(sourceDir: string, pluginId: string): Promise<{ success: boolean; error?: string }> {
  const manifest = readPluginManifest(sourceDir)
  if (!manifest || manifest.id !== pluginId) {
    return { success: false, error: 'Invalid plugin manifest' }
  }
  if (!fs.existsSync(path.join(sourceDir, 'node_modules'))) {
    return { success: false, error: 'Plugin node_modules missing — run npm install in plugin folder first' }
  }

  const dest = getPluginRoot(pluginId)
  const staging = `${dest}.staging-${Date.now()}`
  try {
    copyDirRecursive(sourceDir, staging)
    removeDirRecursive(dest)
    fs.renameSync(staging, dest)
    return { success: true }
  } catch (error: unknown) {
    removeDirRecursive(staging)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function installPluginFromZip(zipPath: string, pluginId: string): Promise<{ success: boolean; error?: string }> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-plugin-'))
  try {
    extractZip(zipPath, tempRoot)
    const pluginDir = normalizeInstalledPluginLayout(tempRoot, pluginId)
    return installPluginFromDirectory(pluginDir, pluginId)
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    removeDirRecursive(tempRoot)
    if (fs.existsSync(zipPath) && zipPath.includes(os.tmpdir())) {
      try {
        fs.unlinkSync(zipPath)
      } catch {
        /* ignore */
      }
    }
  }
}

export async function installPluginFromGitHub(
  pluginId: string,
  version?: string,
): Promise<{ success: boolean; error?: string; url?: string }> {
  let manifest: PluginManifest | null = readBundledPluginManifest(pluginId)
  if (!manifest) {
    const devManifestPath = path.join(app.getAppPath(), 'plugins', pluginId, 'manifest.json')
    if (fs.existsSync(devManifestPath)) {
      manifest = JSON.parse(fs.readFileSync(devManifestPath, 'utf-8')) as PluginManifest
    }
  }
  if (!manifest) {
    manifest = readPluginManifest(getPluginRoot(pluginId))
  }
  if (!manifest?.github || manifest.id !== pluginId) {
    return { success: false, error: 'Plugin manifest has no GitHub release metadata' }
  }

  const appVersion = version || app.getVersion() || manifest.version
  const url = pluginReleaseDownloadUrl(manifest, appVersion)
  if (!url) {
    return { success: false, error: 'Could not resolve plugin download URL' }
  }

  const zipPath = path.join(os.tmpdir(), `metamates-${pluginId}-${appVersion}.zip`)
  try {
    await downloadFile(url, zipPath)
    const result = await installPluginFromZip(zipPath, pluginId)
    return { ...result, url }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error), url }
  }
}

export async function installPluginPreferLocal(
  pluginId: string,
  version?: string,
): Promise<{ success: boolean; error?: string; url?: string; source?: 'local' | 'github' }> {
  const localZip = resolveBundledPluginZip(pluginId, version)
  if (localZip) {
    const local = await installPluginFromZip(localZip, pluginId)
    if (local.success) {
      return { ...local, source: 'local' }
    }
    console.warn(`[Plugin] Local zip install failed (${localZip}): ${local.error}`)
  }
  const remote = await installPluginFromGitHub(pluginId, version)
  return { ...remote, source: 'github' }
}

export async function installDocumentImportFromGitHub(version?: string): Promise<{ success: boolean; error?: string; url?: string; source?: 'local' | 'github' }> {
  return installPluginPreferLocal(DOCUMENT_IMPORT_PLUGIN_ID, version)
}

export async function installOfflineSpeechFromGitHub(version?: string): Promise<{ success: boolean; error?: string; url?: string; source?: 'local' | 'github' }> {
  return installPluginPreferLocal(OFFLINE_SPEECH_PLUGIN_ID, version)
}

export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean }> {
  removeDirRecursive(getPluginRoot(pluginId))
  return { success: true }
}
