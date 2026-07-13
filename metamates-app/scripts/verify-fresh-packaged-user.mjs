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
const EXE_CANDIDATES = [
  process.env.METAMATES_PACKAGED_EXE,
  path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe'),
  path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
].filter(Boolean)
const EXE = EXE_CANDIDATES.find((p) => fs.existsSync(p))
const PROBE = path.join(ROOT, 'scripts', 'lib', 'fresh-user-db-probe.cjs')

if (!EXE) {
  console.error('[fresh-user] No Electron runtime found — run npm ci or electron:build:win')
  process.exit(1)
}
if (!EXE.includes('win-unpacked')) {
  console.warn('[fresh-user] Using dev Electron (packaged MetaMates.exe not found) — ABI smoke only')
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
