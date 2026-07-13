#!/usr/bin/env node
/**
 * Consolidate release/ output: promote latest green portable, remove stale build folders.
 *
 * Keeps:
 *   release/win-unpacked/          (default electron-builder output)
 *   release/portable-green/        (canonical green portable)
 *   release/MetaMates-*.zip        (plugin release zips)
 *
 * Usage: npm run clean:release
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  APP_ROOT as ROOT,
  getReleaseRoot,
  listLegacyReleaseDirs,
  RELEASE_DIR_NAME,
  STALE_RELEASE_SUBDIR_PATTERN,
} from './lib/release-output.mjs'

const OFFICIAL_RELEASE = getReleaseRoot(ROOT)
const GREEN_DIR = path.join(OFFICIAL_RELEASE, 'portable-green')
const GREEN_FRESH = path.join(OFFICIAL_RELEASE, 'portable-green-fresh')
const GREEN_EXE = path.join(GREEN_DIR, 'win-unpacked', 'MetaMates.exe')
const FRESH_EXE = path.join(GREEN_FRESH, 'win-unpacked', 'MetaMates.exe')

function removeTree(dir) {
  if (!fs.existsSync(dir)) return true
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 500 })
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EBUSY') return false
    throw err
  }
  return !fs.existsSync(dir)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function runStop() {
  console.log('[clean-release] npm run stop …')
  spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'stop'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  })
}

function promoteFreshGreenPortable() {
  if (!fs.existsSync(FRESH_EXE)) {
    console.log('[clean-release] skip promote — no portable-green-fresh/win-unpacked/MetaMates.exe')
    return
  }
  const freshMtime = fs.statSync(FRESH_EXE).mtimeMs
  const greenMtime = fs.existsSync(GREEN_EXE) ? fs.statSync(GREEN_EXE).mtimeMs : 0
  if (freshMtime <= greenMtime) {
    console.log('[clean-release] skip promote — portable-green is same age or newer')
    return
  }
  console.log('[clean-release] promote portable-green-fresh → portable-green')
  removeTree(GREEN_DIR)
  fs.mkdirSync(GREEN_DIR, { recursive: true })
  copyDir(path.join(GREEN_FRESH, 'win-unpacked'), path.join(GREEN_DIR, 'win-unpacked'))
  console.log('[clean-release] OK portable-green/win-unpacked updated from fresh build')
}

function listStaleReleaseSubdirs() {
  if (!fs.existsSync(OFFICIAL_RELEASE)) return []
  return fs
    .readdirSync(OFFICIAL_RELEASE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && STALE_RELEASE_SUBDIR_PATTERN.test(d.name))
    .map((d) => path.join(OFFICIAL_RELEASE, d.name))
}

const skipStop = process.env.METAMATES_PACK_SKIP_STOP === '1'
if (!skipStop) runStop()

promoteFreshGreenPortable()

const targets = [
  ...listLegacyReleaseDirs(ROOT),
  ...listStaleReleaseSubdirs(),
  // Always drop the fresh staging folder after promote (or if promote skipped).
  ...(fs.existsSync(GREEN_FRESH) ? [GREEN_FRESH] : []),
]

if (targets.length === 0) {
  console.log('[clean-release] No stale release folders to remove')
} else {
  const failed = []
  for (const dir of targets) {
    const rel = path.relative(ROOT, dir)
    if (removeTree(dir)) {
      console.log(`[clean-release] OK removed ${rel}`)
    } else {
      console.error(`[clean-release] LOCKED ${rel} (close MetaMates.exe using that build, then retry)`)
      failed.push(rel)
    }
  }
  if (failed.length > 0) process.exit(1)
}

const report = path.join(ROOT, 'release-ready-report.json')
if (fs.existsSync(report)) {
  fs.rmSync(report, { force: true })
  console.log('[clean-release] OK release-ready-report.json')
}

console.log('[clean-release] Done — use release/portable-green/win-unpacked/MetaMates.exe')
