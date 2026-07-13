#!/usr/bin/env node
/**
 * Audit dev vs packaged resource paths (extraResources + dist/) before electron-builder.
 * Catches the same class of bug as agent logos: wrong root, missing bundled files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const EXTRA_RESOURCE_PATHS = [
  'inits/zh',
  'inits/en',
  'build/icon.ico',
  'scripts/vault-mcp-bridge.mjs',
  'scripts/ollama-acp-bridge.mjs',
  'docs/user-manual.html',
  'plugins/document-import/manifest.json',
]

const BRANDED_AGENTS = ['claude', 'gemini', 'codebuddy']

async function loadAppPaths() {
  const marker = path.join(ROOT, 'dist-electron', 'shared', 'appPaths.cjs')
  if (!fs.existsSync(marker)) {
    console.error('[pack-paths] Missing dist-electron — run npm run electron:compile')
    process.exit(1)
  }
  return import(pathToFileURL(marker).href)
}

function assertExists(label, filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[pack-paths] MISSING ${label}: ${filePath}`)
    return false
  }
  return true
}

async function main() {
  let ok = true

  if (!assertExists('renderer entry', path.join(ROOT, 'dist', 'index.html'))) ok = false

  for (const rel of EXTRA_RESOURCE_PATHS) {
    if (!assertExists(`extraResource source ${rel}`, path.join(ROOT, rel))) ok = false
  }

  for (const id of BRANDED_AGENTS) {
    if (!assertExists(`dist asset ${id}.svg`, path.join(ROOT, 'dist', 'assets', `${id}.svg`))) ok = false
  }

  const appPaths = await loadAppPaths()
  process.env.METAMATES_APP_ROOT = ROOT
  process.env.METAMATES_RESOURCES_ROOT = ROOT
  process.env.METAMATES_PACKAGED = '1'

  const checks = [
    ['resolveInitsRoot', () => appPaths.resolveInitsRoot()],
    ['resolveBuildIconPath(icon.ico)', () => appPaths.resolveBuildIconPath('icon.ico')],
    ['resolveBundledScript(vault-mcp-bridge.mjs)', () => appPaths.resolveBundledScript('vault-mcp-bridge.mjs')],
    ['resolveBundledScript(ollama-acp-bridge.mjs)', () => appPaths.resolveBundledScript('ollama-acp-bridge.mjs')],
    ['resolveUserManualPath', () => appPaths.resolveUserManualPath()],
    ['resolveAgentAssetsDir(packaged)', () => appPaths.resolveAgentAssetsDir({ appRoot: ROOT, packaged: true })],
  ]

  for (const [name, fn] of checks) {
    const resolved = fn()
    if (resolved == null) {
      console.error(`[pack-paths] NULL ${name}`)
      ok = false
      continue
    }
    if (!fs.existsSync(resolved)) {
      console.error(`[pack-paths] NOT FOUND ${name}: ${resolved}`)
      ok = false
      continue
    }
    console.log(`[pack-paths] OK ${name} → ${path.relative(ROOT, resolved)}`)
  }

  const pluginManifest = appPaths.resolveBundledPath('plugins', 'document-import', 'manifest.json')
  if (!pluginManifest || !fs.existsSync(pluginManifest)) {
    console.error('[pack-paths] MISSING bundled plugin manifest document-import')
    ok = false
  }

  if (!ok) {
    console.error('[pack-paths] FAIL — fix paths or run: npm run icons && npm run build')
    process.exit(1)
  }
  console.log('[pack-paths] All bundled resource paths OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
