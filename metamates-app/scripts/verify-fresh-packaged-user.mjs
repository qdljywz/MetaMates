#!/usr/bin/env node
/**
 * Simulate a brand-new user on a packaged build (Electron ABI + empty data dir).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE = path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe')
const PROBE = path.join(ROOT, 'scripts', 'lib', 'fresh-user-db-probe.cjs')

if (!fs.existsSync(EXE)) {
  console.error('[fresh-user] Missing release/win-unpacked/MetaMates.exe — run npm run electron:build:win first')
  process.exit(1)
}

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-fresh-user-'))
const freshUserData = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(freshUserData, { recursive: true })
console.log('[fresh-user] Simulating new install (empty data dir):', freshUserData)
console.log('[fresh-user] On a real new PC this maps to %APPDATA%\\MetaMates\\')

const result = spawnSync(EXE, [PROBE], {
  cwd: ROOT,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    METAMATES_APP_DATA_DIR: freshUserData,
  },
  encoding: 'utf8',
  timeout: 60_000,
})

if (result.stdout?.trim()) console.log(result.stdout.trim())
if (result.stderr?.trim()) console.error(result.stderr.trim())

const ok = result.status === 0 && fs.existsSync(path.join(freshUserData, 'conversations.sqlite'))

try {
  fs.rmSync(freshRoot, { recursive: true, force: true })
} catch {
  /* ignore */
}

if (!ok) {
  console.error('[fresh-user] FAIL')
  process.exit(1)
}

console.log('[fresh-user] PASS — current release exe can create session DB from scratch')
