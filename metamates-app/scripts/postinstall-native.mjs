#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron after npm install (Node ABI ≠ Electron ABI).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

if (process.env.SKIP_NATIVE_REBUILD === '1' || process.env.CI === 'true') {
  console.log('[postinstall] SKIP_NATIVE_REBUILD — skipping better-sqlite3 rebuild')
  process.exit(0)
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modulePath = path.join(ROOT, 'node_modules', 'better-sqlite3')
if (!fs.existsSync(modulePath)) {
  console.log('[postinstall] better-sqlite3 not installed — skip')
  process.exit(0)
}

const electronPkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'),
)
const target = electronPkg.version

console.log(`[postinstall] Rebuilding better-sqlite3 for Electron ${target}…`)

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['@electron/rebuild', '-f', '-w', 'better-sqlite3'],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
)

if (result.status !== 0) {
  console.warn('[postinstall] @electron/rebuild failed — run: npm run rebuild:native')
  process.exit(0)
}

console.log('[postinstall] better-sqlite3 rebuild OK')
