#!/usr/bin/env node
/**
 * Portable cold-start responsiveness probe (no Playwright).
 * Simulates first-run on a new machine: fresh userData, default (no auto plugin install).
 *
 * Pass criteria:
 * - Process alive at 8s, 12s, 20s
 * - No ProcessCleanup / bundled plugin install before splash defer (~12s)
 * - desktop-ready within 30s
 * - No auto plugin install (UX-35 on-demand)
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { removeTempPath } from './lib/remove-temp-path.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE =
  process.env.METAMATES_PACKAGED_EXE?.trim() ||
  path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')

const DEFER_MS = 12_000
const CHECKPOINTS_MS = [6_000, 8_000, 10_000, 12_000, 20_000, 30_000]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readLog(logPath) {
  try {
    return fs.readFileSync(logPath, 'utf8')
  } catch {
    return ''
  }
}

function scanMilestones(logText, t0, state) {
  for (const line of logText.split(/\r?\n/)) {
    if (!line.trim()) continue
    const elapsed = Date.now() - t0
    if (/desktop-ready|desktop window visible/i.test(line) && state.desktopReadyAtMs == null) {
      state.desktopReadyAtMs = elapsed
    }
    if (/\[ProcessCleanup\]/i.test(line) && state.processCleanupAtMs == null) {
      state.processCleanupAtMs = elapsed
    }
    if (/\[Plugin\].*install/i.test(line) && state.pluginInstallAtMs == null) {
      state.pluginInstallAtMs = elapsed
    }
  }
}

async function main() {
  if (!fs.existsSync(EXE)) {
    console.error('[portable-responsive] Missing exe:', EXE)
    process.exit(1)
  }

  const stamp = Date.now()
  const userData = path.join(os.tmpdir(), `metamates-responsive-${stamp}`)
  const logPath = path.join(os.tmpdir(), `metamates-responsive-${stamp}.log`)
  fs.mkdirSync(userData, { recursive: true })

  const childEnv = { ...process.env }
  delete childEnv.METAMATES_E2E
  delete childEnv.METAMATES_SKIP_BUNDLED_PLUGINS
  delete childEnv.METAMATES_INSTALL_BUNDLED_PLUGINS

  let logFd
  let child
  const state = {
    desktopReadyAtMs: null,
    processCleanupAtMs: null,
    pluginInstallAtMs: null,
  }
  const report = {
    exe: EXE,
    userData,
    logPath,
    checkpoints: [],
    pass: false,
  }

  try {
    logFd = fs.openSync(logPath, 'w')
    child = spawn(
      EXE,
      [`--user-data-dir=${userData}`, '--enable-logging'],
      {
        cwd: path.dirname(EXE),
        env: childEnv,
        stdio: ['ignore', logFd, logFd],
        detached: false,
      },
    )

    const t0 = Date.now()
    let lastElapsed = 0

    for (const targetMs of CHECKPOINTS_MS) {
      const wait = targetMs - lastElapsed
      await sleep(wait)
      lastElapsed = targetMs
      const alive = isAlive(child.pid)
      scanMilestones(readLog(logPath), t0, state)
      const earlyCleanup = state.processCleanupAtMs != null && state.processCleanupAtMs < DEFER_MS - 500
      report.checkpoints.push({
        atMs: targetMs,
        alive,
        processCleanupAtMs: state.processCleanupAtMs,
        pluginInstallAtMs: state.pluginInstallAtMs,
        desktopReadyAtMs: state.desktopReadyAtMs,
        earlyCleanup,
      })
      console.log(
        `[portable-responsive] +${targetMs}ms alive=${alive} desktop=${state.desktopReadyAtMs ?? '-'} cleanup=${state.processCleanupAtMs ?? '-'} plugin=${state.pluginInstallAtMs ?? '-'}`,
      )
      if (!alive) break
    }

    Object.assign(report, state)

    const criticalAlive = report.checkpoints
      .filter((c) => c.atMs === 8_000 || c.atMs === 12_000 || c.atMs === 20_000)
      .every((c) => c.alive)
    const noEarlyHeavyWork = report.checkpoints
      .filter((c) => c.atMs === 10_000)
      .every((c) => !c.earlyCleanup)
    const desktopOk = state.desktopReadyAtMs != null && state.desktopReadyAtMs <= 30_000
    const cleanupDeferred =
      state.processCleanupAtMs == null || state.processCleanupAtMs >= DEFER_MS - 500
    const noAutoPluginInstall = state.pluginInstallAtMs == null

    report.pass = criticalAlive && noEarlyHeavyWork && desktopOk && cleanupDeferred && noAutoPluginInstall

    console.log('[portable-responsive] pass:', report.pass, {
      criticalAlive,
      noEarlyHeavyWork,
      desktopOk,
      cleanupDeferred,
      noAutoPluginInstall,
    })

    if (child && isAlive(child.pid)) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
      await sleep(1000)
    }
  } finally {
    if (logFd !== undefined) {
      try {
        fs.closeSync(logFd)
      } catch {
        /* ignore */
      }
    }
    removeTempPath(userData, { label: 'portable-responsive' })
    removeTempPath(logPath, { label: 'portable-responsive' })
  }

  process.exit(report.pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
