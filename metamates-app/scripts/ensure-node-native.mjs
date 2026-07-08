#!/usr/bin/env node
/**
 * Vitest runs on system Node, but better-sqlite3 is built for Electron only.
 * Never rebuild for Node here — that breaks Electron (NODE_MODULE_VERSION mismatch).
 */
import { probeNodeSqlite, probeElectronSqlite } from './native-sqlite.mjs'

const nodeProbe = probeNodeSqlite()
const electronProbe = probeElectronSqlite()

if (electronProbe.ok) {
  if (nodeProbe.ok) {
    console.log('[ensure-node-native] better-sqlite3 OK for Node and Electron')
  } else {
    console.log(
      '[ensure-node-native] better-sqlite3 built for Electron (expected). Vitest does not require native SQLite.',
    )
    if (nodeProbe.error) {
      console.log('[ensure-node-native] Node probe:', nodeProbe.error.split('\n')[0])
    }
  }
  process.exit(0)
}

console.warn('[ensure-node-native] better-sqlite3 is not usable under Electron.')
if (electronProbe.stderr) console.warn(electronProbe.stderr)
console.warn('[ensure-node-native] Run: npm run rebuild:native  (or npm run start to auto-rebuild)')
process.exit(0)
