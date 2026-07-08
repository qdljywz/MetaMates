#!/usr/bin/env node
/**
 * Before electron-builder: ensure release/app.asar is not locked.
 * Auto-runs npm run stop once, then fails with actionable hints.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIRS = ['release', 'release-build']
const ASAR_REL = path.join('win-unpacked', 'resources', 'app.asar')

function isFileLocked(filePath) {
  if (!fs.existsSync(filePath)) return false
  try {
    const fd = fs.openSync(filePath, 'r+')
    fs.closeSync(fd)
    return false
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return false
    return true
  }
}

function findLockedAsarPaths() {
  const locked = []
  for (const dir of OUTPUT_DIRS) {
    const asarPath = path.join(APP_ROOT, dir, ASAR_REL)
    if (isFileLocked(asarPath)) locked.push(asarPath)
  }
  return locked
}

function listRelatedProcessesWindows() {
  const script = `
$rows = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    $_.CommandLine -match 'MetaMates|Metamates|metamates-app|vault-mcp-bridge|ollama-acp-bridge|win-unpacked'
  )
} | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd.Length -gt 140) { $cmd = $cmd.Substring(0, 140) + '…' }
  "$($_.ProcessId)|$($_.Name)|$cmd"
}
$rows -join [Environment]::NewLine
`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  })
  return (result.stdout || '').trim().split(/\r?\n/).filter(Boolean)
}

function runStopScript() {
  console.log('[pack-lock] Running npm run stop …')
  spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'stop'], {
    cwd: APP_ROOT,
    stdio: 'inherit',
    shell: false,
  })
}

function sleep(ms) {
  if (process.platform === 'win32') {
    spawnSync('powershell.exe', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  spawnSync('sleep', [String(Math.ceil(ms / 1000))], { stdio: 'ignore' })
}

function reportFailure(lockedPaths, attemptedStop) {
  console.error('[pack-lock] app.asar is locked — electron-builder cannot overwrite:')
  for (const p of lockedPaths) console.error(`  ${p}`)

  if (process.platform === 'win32') {
    const procs = listRelatedProcessesWindows()
    if (procs.length > 0) {
      console.error('\n[pack-lock] Related processes still running:')
      for (const line of procs) {
        const [pid, name, cmd] = line.split('|')
        console.error(`  PID ${pid} ${name} — ${cmd}`)
      }
    } else {
      console.error('\n[pack-lock] No MetaMates/electron processes found.')
      console.error('  Likely Cursor, Windows Defender, or Explorer is holding the file.')
    }
  }

  console.error('\n[pack-lock] Try:')
  console.error('  1. npm run stop')
  console.error('  2. Close MetaMates (including release\\win-unpacked\\MetaMates.exe if you used the portable build)')
  console.error('  3. npm run clean:artifacts   (or close Cursor and rerun)')
  if (!attemptedStop) {
    console.error('  (Auto-stop was skipped — set METAMATES_PACK_SKIP_STOP=1 only when debugging)')
  }
  process.exit(1)
}

let locked = findLockedAsarPaths()
if (locked.length === 0) {
  console.log('[pack-lock] OK — release folders are not locked')
  process.exit(0)
}

const skipStop = process.env.METAMATES_PACK_SKIP_STOP === '1'
if (!skipStop) {
  runStopScript()
  sleep(2000)
  locked = findLockedAsarPaths()
}

if (locked.length === 0) {
  console.log('[pack-lock] OK — unlocked after stop')
  process.exit(0)
}

reportFailure(locked, !skipStop)
