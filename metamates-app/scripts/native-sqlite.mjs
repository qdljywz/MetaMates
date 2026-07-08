#!/usr/bin/env node
/**
 * Shared better-sqlite3 probes + Electron rebuild helpers.
 * MetaMates only loads SQLite in the Electron main process — never rebuild for system Node.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SQLITE_MODULE = path.join(ROOT, 'node_modules', 'better-sqlite3')
const SQLITE_BINARY = path.join(SQLITE_MODULE, 'build', 'Release', 'better_sqlite3.node')

export function getElectronVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'))
  return pkg.version
}

export function probeNodeSqlite() {
  const require = createRequire(import.meta.url)
  try {
    const Database = require(SQLITE_MODULE)
    const db = new Database(':memory:')
    db.close()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export function probeElectronSqlite() {
  const require = createRequire(import.meta.url)
  const electronPath = require('electron')
  const probePath = path.join(os.tmpdir(), `metamates-sqlite-probe-${process.pid}.cjs`)
  fs.writeFileSync(
    probePath,
    `try {\n` +
      `  const Database = require(${JSON.stringify(SQLITE_MODULE)})\n` +
      `  const db = new Database(':memory:')\n` +
      `  db.close()\n` +
      `  process.exit(0)\n` +
      `} catch (e) {\n` +
      `  console.error(String(e))\n` +
      `  process.exit(1)\n` +
      `}\n`,
    'utf8',
  )
  try {
    const result = spawnSync(electronPath, [probePath], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
    }
  } finally {
    try {
      fs.unlinkSync(probePath)
    } catch {
      // ignore
    }
  }
}

function isMetaMatesElectron(name, commandLine, appRoot) {
  const exe = (name || '').toLowerCase()
  if (exe !== 'electron.exe') return false
  const cmd = (commandLine || '').replace(/\\/g, '/')
  const root = appRoot.replace(/\\/g, '/')
  if (!cmd.includes(root)) return false
  return (
    /dist-electron\/main\.cjs/i.test(cmd) ||
    /metamates-app[\\/]node_modules[\\/]electron/i.test(cmd) ||
    /metamates-app[\\/]\./i.test(cmd) ||
    /electron:dev/i.test(cmd) ||
    /win-unpacked/i.test(cmd)
  )
}

/** Kill only stale MetaMates Electron processes that may lock better_sqlite3.node */
export function killBlockingElectronProcesses(appRoot = ROOT) {
  if (process.platform !== 'win32') {
    try {
      spawnSync('pkill', ['-f', `${appRoot.replace(/\\/g, '/')}.*/electron`], { stdio: 'ignore' })
    } catch {
      // ignore
    }
    return
  }

  const root = appRoot.replace(/\\/g, '/').replace(/'/g, "''")
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -and ($_.CommandLine -replace '\\\\','/') -like '*${root}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: 'ignore', windowsHide: true },
  )
}

export function rebuildSqliteForElectron(options = {}) {
  const version = options.electronVersion || getElectronVersion()
  console.log(`[native-sqlite] Rebuilding better-sqlite3 for Electron ${version}…`)

  if (options.killBlockingElectron) {
    killBlockingElectronProcesses(ROOT)
  }

  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  return spawnSync(
    cmd,
    ['@electron/rebuild', '-f', '-w', 'better-sqlite3', '-v', version],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  )
}

export function ensureElectronSqlite(options = {}) {
  const first = probeElectronSqlite()
  if (first.ok) {
    return { ok: true, rebuilt: false }
  }

  console.warn('[native-sqlite] better-sqlite3 failed under Electron:')
  if (first.stderr) console.warn(first.stderr)
  if (first.stdout) console.warn(first.stdout)

  const rebuild = rebuildSqliteForElectron({
    killBlockingElectron: options.killBlockingElectron ?? true,
  })
  if (rebuild.status !== 0) {
    return { ok: false, rebuilt: true, error: 'rebuild failed — close MetaMates and run: npm run rebuild:native' }
  }

  const second = probeElectronSqlite()
  if (second.ok) {
    return { ok: true, rebuilt: true }
  }

  return {
    ok: false,
    rebuilt: true,
    error: second.stderr || second.stdout || 'still failing after rebuild',
  }
}

export function sqliteBinaryExists() {
  return fs.existsSync(SQLITE_BINARY)
}
