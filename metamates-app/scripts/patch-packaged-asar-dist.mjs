#!/usr/bin/env node
/** Patch portable-green app.asar dist/ after `npm run build` — skips full electron-builder. */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const distSrc = path.join(ROOT, 'dist')
const distElectronSrc = path.join(ROOT, 'dist-electron')
const exe = path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const asarPath = path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'resources', 'app.asar')
const extractDir = path.join(ROOT, 'tmp-asar-patch')

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!fs.existsSync(distSrc)) {
  console.error('[patch-asar] Run npm run build first')
  process.exit(1)
}
if (!fs.existsSync(distElectronSrc)) {
  console.error('[patch-asar] Run npm run electron:compile first')
  process.exit(1)
}
if (!fs.existsSync(asarPath)) {
  console.error('[patch-asar] Missing', asarPath)
  process.exit(1)
}

try {
  fs.rmSync(extractDir, { recursive: true, force: true })
} catch {
  /* ignore */
}

console.log('[patch-asar] extract', asarPath)
run('npx', ['@electron/asar', 'extract', asarPath, extractDir])

const distDest = path.join(extractDir, 'dist')
fs.rmSync(distDest, { recursive: true, force: true })
fs.cpSync(distSrc, distDest, { recursive: true })

const distElectronDest = path.join(extractDir, 'dist-electron')
fs.rmSync(distElectronDest, { recursive: true, force: true })
fs.cpSync(distElectronSrc, distElectronDest, { recursive: true })

console.log('[patch-asar] pack', asarPath)
run('npx', ['@electron/asar', 'pack', extractDir, asarPath])

try {
  fs.rmSync(extractDir, { recursive: true, force: true })
} catch {
  /* ignore */
}

console.log('[patch-asar] OK — patched dist + dist-electron in portable-green app.asar')
console.log('[patch-asar] exe:', exe)
