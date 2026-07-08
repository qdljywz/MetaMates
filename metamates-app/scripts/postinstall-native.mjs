#!/usr/bin/env node
/**
 * Rebuild native modules for Electron after npm install (Node ABI ≠ Electron ABI).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuildSqliteForElectron, sqliteBinaryExists, probeElectronSqlite } from './native-sqlite.mjs'

if (process.env.SKIP_NATIVE_REBUILD === '1') {
  console.log('[postinstall] SKIP_NATIVE_REBUILD — skipping native rebuild')
  process.exit(0)
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'better-sqlite3'))) {
  console.log('[postinstall] better-sqlite3 not installed — skip native rebuild')
  process.exit(0)
}

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'))) {
  console.log('[postinstall] Electron not installed yet — skip native rebuild')
  process.exit(0)
}

if (sqliteBinaryExists()) {
  if (probeElectronSqlite().ok) {
    console.log('[postinstall] better-sqlite3 already OK for Electron — skip rebuild')
    process.exit(0)
  }
}

console.log('[postinstall] Rebuilding better-sqlite3 for Electron…')
const result = rebuildSqliteForElectron({ killBlockingElectron: false })

if (result.status !== 0) {
  console.warn('[postinstall] @electron/rebuild failed — run: npm run rebuild:native')
  process.exit(0)
}

console.log('[postinstall] Native rebuild OK')
