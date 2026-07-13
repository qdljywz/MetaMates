#!/usr/bin/env node
/**
 * Dev smoke: core import + optional document-import plugin (no GUI).
 * Run: npm run electron:compile && npm run verify:document-import-dev
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROBE = path.join(ROOT, 'scripts', 'lib', 'document-import-dev-probe.cjs')
const ELECTRON = process.platform === 'win32'
  ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron')

if (!fs.existsSync(ELECTRON)) {
  console.error('[doc-import-dev] Missing Electron binary — run npm ci first')
  process.exit(1)
}
if (!fs.existsSync(path.join(ROOT, 'dist-electron', 'documentExtract', 'extractDocument.cjs'))) {
  console.error('[doc-import-dev] Missing dist-electron — run npm run electron:compile first')
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-doc-import-'))
const userData = path.join(tmp, 'userdata')
fs.mkdirSync(userData, { recursive: true })

const mdPath = path.join(tmp, 'sample.md')
fs.writeFileSync(mdPath, '# Dev probe\n\nCore markdown import works.\n', 'utf-8')

const result = spawnSync(ELECTRON, [PROBE, mdPath], {
  cwd: ROOT,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    METAMATES_APP_DATA_DIR: userData,
    METAMATES_DOC_IMPORT_PROBE_MD: mdPath,
  },
  encoding: 'utf8',
  timeout: 120_000,
})

if (result.stdout?.trim()) console.log(result.stdout.trim())
if (result.stderr?.trim()) console.error(result.stderr.trim())

try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  /* ignore */
}

if (result.status !== 0) {
  console.error('[doc-import-dev] FAIL')
  process.exit(result.status ?? 1)
}

console.log('[doc-import-dev] PASS')
