#!/usr/bin/env node
/**
 * Verify better-sqlite3 loads under Electron (ABI ≠ system Node).
 * Rebuild automatically when Vitest or other tools rebuilt for Node only.
 */
import { ensureElectronSqlite } from './native-sqlite.mjs'

const result = ensureElectronSqlite({ killBlockingElectron: true })

if (result.ok) {
  console.log(
    result.rebuilt
      ? '[ensure-electron-native] rebuild OK'
      : '[ensure-electron-native] better-sqlite3 OK for Electron',
  )
  process.exit(0)
}

console.error('[ensure-electron-native]', result.error || 'better-sqlite3 still failing after rebuild')
process.exit(1)
