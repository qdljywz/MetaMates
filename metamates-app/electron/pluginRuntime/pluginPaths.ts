import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getAppRoot, getWritableAppDataDir, resolveBundledPath } from '../shared/appPaths'
import { pluginReleaseAssetName, type PluginManifest } from './pluginManifest'

export function getPluginsRoot(): string {
  if (process.env.METAMATES_APP_DATA_DIR) {
    return path.join(getWritableAppDataDir(), 'plugins')
  }
  try {
    if (typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'plugins')
    }
  } catch {
    // unit tests / node scripts without Electron app
  }
  return path.join(getWritableAppDataDir(), 'plugins')
}

export function getPluginRoot(pluginId: string): string {
  return path.join(getPluginsRoot(), pluginId)
}

export function readPluginManifest(pluginRoot: string): PluginManifest | null {
  const manifestPath = path.join(pluginRoot, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest
  } catch {
    return null
  }
}

/** Installed plugin dir under userData/plugins/<id>, with dev/bundled fallbacks. */
export function resolvePluginRoot(pluginId: string): string | null {
  const installed = getPluginRoot(pluginId)
  if (isPluginRootReady(installed)) return installed

  const allowBundledDiscovery = process.env.METAMATES_E2E_NO_DEV_PLUGINS !== '1'
  if (!allowBundledDiscovery) return null

  const devRoot = path.join(getAppRoot(), 'plugins', pluginId)
  if (isPluginRootReady(devRoot)) return devRoot

  const bundledManifest = resolveBundledPath('plugins', pluginId, 'manifest.json')
  if (bundledManifest) {
    const bundledRoot = path.dirname(bundledManifest)
    if (isPluginRootReady(bundledRoot)) return bundledRoot
  }

  return null
}

export function readBundledPluginManifest(pluginId: string): PluginManifest | null {
  const manifestPath = resolveBundledPath('plugins', pluginId, 'manifest.json')
  if (!manifestPath || !fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest
  } catch {
    return null
  }
}

/** App semver for release asset names (not Electron's own version in script probes). */
function readAppPackageVersion(): string | null {
  for (const root of [getAppRoot(), process.cwd()]) {
    try {
      const pkgPath = path.join(root, 'package.json')
      if (!fs.existsSync(pkgPath)) continue
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string; version?: string }
      if (pkg.name === 'metamates-app' && pkg.version) return pkg.version
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Packaged zip next to app (build/plugin-zips, resources, or release/). */
export function resolveBundledPluginZip(pluginId: string, appVersion?: string): string | null {
  const version = appVersion || readAppPackageVersion() || app.getVersion?.() || '0.1.0'
  let manifest = readBundledPluginManifest(pluginId)
  if (!manifest) {
    const devManifestPath = path.join(getAppRoot(), 'plugins', pluginId, 'manifest.json')
    if (fs.existsSync(devManifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(devManifestPath, 'utf-8')) as PluginManifest
      } catch {
        manifest = null
      }
    }
  }
  const assetName =
    (manifest && pluginReleaseAssetName(manifest, version)) ||
    `MetaMates-${pluginId}-${version}-win-x64.zip`

  const appRoot = getAppRoot()
  const cwd = process.cwd()
  const packagedResources = process.execPath
    ? path.join(path.dirname(process.execPath), 'resources')
    : null
  const candidates = [
    packagedResources ? path.join(packagedResources, 'plugin-zips', assetName) : null,
    resolveBundledPath('plugin-zips', assetName),
    resolveBundledPath('plugins', assetName),
    path.join(appRoot, 'build', 'plugin-zips', assetName),
    path.join(appRoot, 'release', assetName),
    path.join(appRoot, 'plugins', assetName),
    // Electron verify scripts: getAppPath() may point at default_app, not project root.
    path.join(cwd, 'build', 'plugin-zips', assetName),
    path.join(cwd, 'release', assetName),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export function isPluginRootReady(pluginRoot: string): boolean {
  const manifest = readPluginManifest(pluginRoot)
  if (!manifest?.main) return false
  const mainPath = path.join(pluginRoot, manifest.main)
  if (!fs.existsSync(mainPath)) return false
  const nodeModules = path.join(pluginRoot, 'node_modules')
  return fs.existsSync(nodeModules)
}

export function listInstalledPluginIds(): string[] {
  const root = getPluginsRoot()
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isPluginRootReady(path.join(root, d.name)))
    .map((d) => d.name)
}
