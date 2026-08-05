#!/usr/bin/env node
/**
 * Portable plugin install smoke (opt-in env — not default startup).
 * 1) Default start: plugins stay absent for 20s (on-demand policy).
 * 2) Restart with METAMATES_INSTALL_BUNDLED_PLUGINS=1: both plugins install.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { removeTempPath } from './lib/remove-temp-path.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE = path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const MAX_INSTALL_MS = 480_000

function isPluginReady(userData, id) {
  const root = path.join(userData, 'plugins', id)
  return (
    fs.existsSync(path.join(root, 'manifest.json')) &&
    fs.existsSync(path.join(root, 'node_modules'))
  )
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function spawnApp(userData, logPath, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  delete env.METAMATES_E2E
  delete env.METAMATES_SKIP_BUNDLED_PLUGINS
  delete env.METAMATES_E2E_ALLOW_BUNDLED_PLUGINS
  if (!extraEnv.METAMATES_INSTALL_BUNDLED_PLUGINS) {
    delete env.METAMATES_INSTALL_BUNDLED_PLUGINS
  }
  const fd = fs.openSync(logPath, 'w')
  const child = spawn(EXE, [`--user-data-dir=${userData}`, '--enable-logging'], {
    env,
    stdio: ['ignore', fd, fd],
  })
  return { child, fd }
}

function killApp(child, fd) {
  try {
    fs.closeSync(fd)
  } catch {
    /* ignore */
  }
  if (child?.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
  }
}

if (!fs.existsSync(EXE)) {
  console.error('[plugin-poll] Missing exe:', EXE)
  process.exit(1)
}

const stamp = Date.now()
const userData = path.join(os.tmpdir(), `mm-plugin-ondemand-${stamp}`)
fs.mkdirSync(userData, { recursive: true })

// Phase 1: default start — must NOT auto-install
{
  const logPath = path.join(os.tmpdir(), `mm-plugin-ondemand-phase1-${stamp}.log`)
  const { child, fd } = spawnApp(userData, logPath)
  await sleep(20_000)
  const doc = isPluginReady(userData, 'document-import')
  const speech = isPluginReady(userData, 'offline-speech')
  killApp(child, fd)
  removeTempPath(logPath, { label: 'plugin-poll-p1' })
  console.log(`[plugin-poll] phase1 (20s default): doc=${doc} speech=${speech}`)
  if (doc || speech) {
    console.error('[plugin-poll] FAIL — plugins auto-installed on default startup')
    removeTempPath(userData, { label: 'plugin-poll' })
    process.exit(1)
  }
}

// Phase 2: opt-in install smoke
{
  const logPath = path.join(os.tmpdir(), `mm-plugin-ondemand-phase2-${stamp}.log`)
  const { child, fd } = spawnApp(userData, logPath, { METAMATES_INSTALL_BUNDLED_PLUGINS: '1' })
  const t0 = Date.now()
  let ok = false
  while (Date.now() - t0 < MAX_INSTALL_MS) {
    await sleep(15_000)
    const doc = isPluginReady(userData, 'document-import')
    const speech = isPluginReady(userData, 'offline-speech')
    const elapsed = Math.round((Date.now() - t0) / 1000)
    console.log(`[plugin-poll] phase2 +${elapsed}s doc=${doc} speech=${speech}`)
    if (doc && speech) {
      ok = true
      break
    }
  }
  killApp(child, fd)
  if (!ok) {
    const pluginLines = fs
      .readFileSync(logPath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /\[Plugin\]/i.test(l))
    console.log(pluginLines.slice(-20).join('\n'))
  }
  removeTempPath(logPath, { label: 'plugin-poll-p2' })
  removeTempPath(userData, { label: 'plugin-poll' })
  if (!ok) {
    console.error('[plugin-poll] FAIL — opt-in install did not finish')
    process.exit(1)
  }
  console.log('[plugin-poll] PASS')
  process.exit(0)
}
