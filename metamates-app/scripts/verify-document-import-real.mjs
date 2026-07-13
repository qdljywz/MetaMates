#!/usr/bin/env node
/**
 * Simulate user PDF/DOCX intelligence import (full prepareIntelligenceImport path).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROBE = path.join(ROOT, 'scripts', 'lib', 'document-import-real-probe.cjs')
const ELECTRON = process.platform === 'win32'
  ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron')

if (!fs.existsSync(ELECTRON)) {
  console.error('[real-import] Missing Electron — run npm ci')
  process.exit(1)
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-real-import-user-'))

const result = spawnSync(ELECTRON, [PROBE], {
  cwd: ROOT,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    METAMATES_APP_DATA_DIR: userData,
  },
  encoding: 'utf8',
  timeout: 180_000,
})

if (result.stdout?.trim()) console.log(result.stdout.trim())
if (result.stderr?.trim()) console.error(result.stderr.trim())

try {
  fs.rmSync(userData, { recursive: true, force: true })
} catch {
  /* ignore */
}

if (result.status !== 0) {
  console.error('[real-import] FAIL')
  process.exit(result.status ?? 1)
}

console.log('[real-import] PASS')
