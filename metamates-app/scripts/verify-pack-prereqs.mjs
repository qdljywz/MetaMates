#!/usr/bin/env node
/**
 * Validate files required for electron-builder packaging.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const required = [
  'dist/index.html',
  'dist-electron/main.cjs',
  'dist-electron/preload.cjs',
  'build/icon.ico',
  'build/icon.png',
  'inits/zh',
  'inits/en',
  'scripts/vault-mcp-bridge.mjs',
  'scripts/ollama-acp-bridge.mjs',
  'LICENSE',
  'electron-builder.yml',
]

const warnings = [
  'build/icon.icns',
  'public/assets',
]

let failed = false

for (const rel of required) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    console.error(`[pack] MISSING required: ${rel}`)
    failed = true
  }
}

for (const rel of warnings) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    console.warn(`[pack] WARN optional: ${rel}`)
  }
}

const nodeFile = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
if (!fs.existsSync(nodeFile)) {
  console.warn('[pack] WARN native module not built: better-sqlite3 — run npm run rebuild:native')
}

if (failed) {
  console.error('[pack] Prerequisites failed. Run: npm run build && npm run electron:compile && npm run icons')
  process.exit(1)
}

console.log('[pack] Prerequisites OK')
