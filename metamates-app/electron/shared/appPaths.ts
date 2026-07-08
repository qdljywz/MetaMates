/**
 * Resolve paths for dev vs packaged (Windows/macOS) installs.
 * extraResources land in process.resourcesPath; app code lives in app.asar.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** Dev: project root. Packaged: app.asar root. */
export function getAppRoot(): string {
  return app.getAppPath()
}

/**
 * Writable app data directory.
 * Packaged installs must not write under app.asar (read-only).
 * Dev keeps project root for backward compatibility with existing local DB files.
 */
export function getWritableAppDataDir(): string {
  if (process.env.METAMATES_APP_DATA_DIR) {
    return path.resolve(process.env.METAMATES_APP_DATA_DIR)
  }
  try {
    if (app.isPackaged) {
      return app.getPath('userData')
    }
  } catch {
    // unit tests / node scripts without Electron app
  }
  return getAppRoot()
}

/** Root for bundled scripts, inits, icons, assets (extraResources). */
export function getResourcesRoot(): string {
  if (!app.isPackaged) {
    return getAppRoot()
  }
  return process.resourcesPath
}

export function resolveBundledPath(...segments: string[]): string {
  return path.join(getResourcesRoot(), ...segments)
}

export function resolveBundledScript(scriptName: string): string | null {
  const scriptPath = resolveBundledPath('scripts', scriptName)
  return fs.existsSync(scriptPath) ? scriptPath : null
}

export function resolvePublicAssetsPath(): string {
  if (!app.isPackaged) {
    return path.join(getAppRoot(), 'public', 'assets')
  }
  return path.join(process.resourcesPath, 'assets')
}

export function resolveInitsRoot(): string {
  return resolveBundledPath('inits')
}

export function resolveBuildIconPath(fileName: string): string {
  if (!app.isPackaged) {
    return path.join(getAppRoot(), 'build', fileName)
  }
  return path.join(process.resourcesPath, 'build', fileName)
}

/** Runtime for bundled .mjs helpers (Vault MCP bridge, etc.). */
export function getNodeLikeRuntime(): {
  command: string
  extraEnv: Array<{ name: string; value: string }>
} {
  if (!app.isPackaged) {
    return { command: 'node', extraEnv: [] }
  }
  return {
    command: process.execPath,
    extraEnv: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
  }
}
