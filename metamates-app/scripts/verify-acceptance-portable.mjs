#!/usr/bin/env node
/**
 * Overnight acceptance gate for green portable build.
 * Usage: node scripts/verify-acceptance-portable.mjs
 */
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { removeTempPath } from './lib/remove-temp-path.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = path.join(ROOT, 'acceptance-report.json')

function resolveExe() {
  const fromEnv = process.env.METAMATES_PACKAGED_EXE?.trim()
  const candidates = [
    fromEnv,
    path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'unpacked-fix', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe'),
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function pluginRoots(userData) {
  return {
    documentImport: path.join(userData, 'plugins', 'document-import'),
    offlineSpeech: path.join(userData, 'plugins', 'offline-speech'),
  }
}

function isPluginReady(root) {
  const manifest = path.join(root, 'manifest.json')
  const nodeModules = path.join(root, 'node_modules')
  return fs.existsSync(manifest) && fs.existsSync(nodeModules)
}

/** Bundled plugin auto-install (doc ~52MB + speech ~128MB) can exceed 5 min after ACP warmup. */
async function waitForPlugins(userData, timeoutMs = 600_000) {
  const roots = pluginRoots(userData)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const doc = isPluginReady(roots.documentImport)
    const speech = isPluginReady(roots.offlineSpeech)
    if (doc && speech) return { documentImport: true, offlineSpeech: true, elapsedMs: timeoutMs - (deadline - Date.now()) }
    await sleep(5000)
  }
  return {
    documentImport: isPluginReady(roots.documentImport),
    offlineSpeech: isPluginReady(roots.offlineSpeech),
    elapsedMs: timeoutMs,
  }
}

async function main() {
  const exe = resolveExe()
  const report = {
    generatedAt: new Date().toISOString(),
    exe: exe ?? null,
    checks: {},
    ok: false,
  }

  if (!exe) {
    report.checks.exe = { ok: false, error: 'MetaMates.exe not found' }
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2))
    console.error('[acceptance] FAIL — no exe')
    process.exit(1)
  }

  const zipDir = path.join(path.dirname(exe), 'resources', 'plugin-zips')
  const zips = fs.existsSync(zipDir)
    ? fs.readdirSync(zipDir).filter((f) => f.endsWith('.zip'))
    : []
  report.checks.bundledZips = {
    ok: zips.length >= 2,
    zips,
    path: zipDir,
  }

  const stamp = Date.now()
  const userData = path.join(os.tmpdir(), `metamates-acceptance-${stamp}`)
  fs.mkdirSync(userData, { recursive: true })
  const logPath = path.join(os.tmpdir(), `metamates-acceptance-${stamp}.log`)
  let logFd
  let child
  let exitCode = 1

  try {
    logFd = fs.openSync(logPath, 'w')

    const childEnv = { ...process.env }
    delete childEnv.METAMATES_E2E
    delete childEnv.METAMATES_SKIP_BUNDLED_PLUGINS
    delete childEnv.METAMATES_E2E_ALLOW_BUNDLED_PLUGINS

    child = spawn(exe, [`--user-data-dir=${userData}`, '--enable-logging'], {
      cwd: path.dirname(exe),
      env: childEnv,
      stdio: ['ignore', logFd, logFd],
      detached: false,
    })

    let alive12 = false
    await sleep(12_000)
    try {
      process.kill(child.pid, 0)
      alive12 = true
    } catch {
      alive12 = false
    }

    report.checks.survives12s = { ok: alive12, pid: child.pid }

    const plugins = await waitForPlugins(userData, alive12 ? 600_000 : 1_000)
    report.checks.autoInstallPlugins = {
      ok: plugins.documentImport && plugins.offlineSpeech,
      ...plugins,
      userData,
    }

    try {
      if (alive12) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
      }
    } catch {
      /* ignore */
    }
    await sleep(1500)

    const logTail = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-30).join('\n')
      : ''
    report.logTail = logTail

    report.ok =
      report.checks.bundledZips.ok
      && report.checks.survives12s.ok
      && report.checks.autoInstallPlugins.ok

    let merged = report
    if (fs.existsSync(REPORT)) {
      try {
        const prior = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
        const acceptancePortable = {
          ok: report.ok,
          bundledZips: report.checks.bundledZips?.zips ?? [],
          survives12sNoGreyScreen: report.checks.survives12s?.ok === true,
          autoInstallPluginsSec: Math.round((report.checks.autoInstallPlugins?.elapsedMs ?? 0) / 1000),
        }
        merged = {
          ...prior,
          generatedAt: report.generatedAt,
          exe: report.exe ?? prior.exe,
          checks: { ...(prior.checks ?? {}), ...report.checks },
          acceptancePortable,
          ok: report.ok,
          logTail: report.logTail,
        }
        if (prior.verification) {
          merged.verification = { ...prior.verification, acceptancePortable }
        }
      } catch {
        merged = report
      }
    }

    fs.writeFileSync(REPORT, JSON.stringify(merged, null, 2))
    console.log('[acceptance] report →', REPORT)
    console.log(JSON.stringify(report.checks, null, 2))
    exitCode = report.ok ? 0 : 1
  } finally {
    if (logFd !== undefined) {
      try {
        fs.closeSync(logFd)
      } catch {
        /* ignore */
      }
    }
    removeTempPath(userData, { label: 'acceptance' })
    removeTempPath(logPath, { label: 'acceptance' })
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
