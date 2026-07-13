/**
 * Resolve paths for dev vs packaged (Windows/macOS) installs.
 * extraResources land in process.resourcesPath; app code lives in app.asar.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** Dev: project root. Packaged: app.asar root. */
export function getAppRoot(): string {
  if (process.env.METAMATES_APP_ROOT) {
    return path.resolve(process.env.METAMATES_APP_ROOT)
  }
  try {
    if (app.isReady?.() || typeof app.getAppPath === 'function') {
      const appPath = app.getAppPath()
      if (app.isPackaged || fs.existsSync(path.join(appPath, 'package.json'))) {
        return appPath
      }
    }
  } catch {
    // unit tests / ELECTRON_RUN_AS_NODE probes without BrowserWindow
  }
  return process.cwd()
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

/** Override for node verify scripts: METAMATES_PACKAGED=1|0 */
export function isPackagedRuntime(): boolean {
  const forced = process.env.METAMATES_PACKAGED
  if (forced === '1') return true
  if (forced === '0') return false
  try {
    return app.isPackaged
  } catch {
    return false
  }
}

/** Root for bundled scripts, inits, icons, assets (extraResources). */
export function getResourcesRoot(): string {
  if (process.env.METAMATES_RESOURCES_ROOT) {
    return path.resolve(process.env.METAMATES_RESOURCES_ROOT)
  }
  if (!isPackagedRuntime()) {
    return getAppRoot()
  }
  const fromResourcesPath = process.resourcesPath?.trim()
  if (fromResourcesPath) return fromResourcesPath
  // win-unpacked portable: extraResources live beside MetaMates.exe
  if (process.execPath) {
    return path.join(path.dirname(process.execPath), 'resources')
  }
  return getAppRoot()
}

export function resolveBundledPath(...segments: string[]): string {
  return path.join(getResourcesRoot(), ...segments)
}

export function resolveBundledScript(scriptName: string): string | null {
  const scriptPath = resolveBundledPath('scripts', scriptName)
  return fs.existsSync(scriptPath) ? scriptPath : null
}

/**
 * Agent brand SVGs on disk.
 * - Dev / main-process probe: public/assets (Vite public dir)
 * - Packaged app.asar: dist/assets (Vite copies public/ → dist/ at build time)
 * Do NOT use process.resourcesPath/assets — extraResources are for scripts/inits, not UI SVGs.
 */
export function resolveAgentAssetsDir(options?: { appRoot?: string; packaged?: boolean }): string {
  const root = options?.appRoot ?? getAppRoot()
  const packaged = options?.packaged ?? isPackagedRuntime()
  if (!packaged) {
    return path.join(root, 'public', 'assets')
  }
  return path.join(root, 'dist', 'assets')
}

/** @deprecated Prefer resolveAgentAssetsDir — kept for call sites that already use this name. */
export function resolvePublicAssetsPath(): string {
  return resolveAgentAssetsDir()
}

export function resolveInitsRoot(): string {
  return resolveBundledPath('inits')
}

/** Bundled user manual HTML (extraResources/docs in packaged builds). */
export function resolveUserManualPath(): string | null {
  const candidates = [
    resolveBundledPath('docs', 'user-manual.html'),
    path.join(getAppRoot(), 'docs', 'user-manual.html'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export function resolveBuildIconPath(fileName: string): string {
  if (!isPackagedRuntime()) {
    return path.join(getAppRoot(), 'build', fileName)
  }
  return path.join(getResourcesRoot(), 'build', fileName)
}

/** Runtime for bundled .mjs helpers (Vault MCP bridge, etc.). */
export function getNodeLikeRuntime(): {
  command: string
  extraEnv: Array<{ name: string; value: string }>
} {
  if (!isPackagedRuntime()) {
    return { command: 'node', extraEnv: [] }
  }
  return {
    command: process.execPath,
    extraEnv: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
  }
}
