#!/usr/bin/env node
/**
 * Serialize electron:compile across parallel E2E scripts (Windows EPERM guard).
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LOCK_PATH = path.join(ROOT, '.electron-compile.lock')
const MARKER = path.join(ROOT, 'dist-electron', 'main.cjs')
const LOCK_STALE_MS = 5 * 60 * 1000
const WAIT_MS = 120_000

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function newestMtime(dir) {
  let newest = 0
  if (!fs.existsSync(dir)) return 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      newest = Math.max(newest, fs.statSync(full).mtimeMs)
    }
  }
  return newest
}

function isDistFresh() {
  if (!fs.existsSync(MARKER)) return false
  const distMtime = fs.statSync(MARKER).mtimeMs
  const srcMtime = newestMtime(path.join(ROOT, 'electron'))
  return distMtime >= srcMtime - 1000
}

function tryAcquireLock() {
  if (fs.existsSync(LOCK_PATH)) {
    const age = Date.now() - fs.statSync(LOCK_PATH).mtimeMs
    if (age < LOCK_STALE_MS) return false
    try { fs.unlinkSync(LOCK_PATH) } catch { /* ignore */ }
  }
  fs.writeFileSync(LOCK_PATH, `${process.pid}\n${Date.now()}`)
  return true
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH)
  } catch { /* ignore */ }
}

export async function safeElectronCompile(options = {}) {
  const { force = false, quiet = true } = options

  if (!force && isDistFresh()) {
    return { skipped: true, reason: 'dist-electron up to date' }
  }

  const started = Date.now()
  while (!tryAcquireLock()) {
    if (Date.now() - started > WAIT_MS) {
      throw new Error('Timed out waiting for electron:compile lock')
    }
    if (isDistFresh()) {
      return { skipped: true, reason: 'compiled by peer' }
    }
    await sleep(1500)
  }

  try {
    if (!force && isDistFresh()) {
      return { skipped: true, reason: 'compiled while waiting' }
    }
    execSync('npm run electron:compile', {
      cwd: ROOT,
      stdio: quiet ? 'pipe' : 'inherit',
    })
    return { skipped: false }
  } finally {
    releaseLock()
  }
}
