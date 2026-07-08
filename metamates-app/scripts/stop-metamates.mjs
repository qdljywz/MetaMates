#!/usr/bin/env node
/**
 * Stop MetaMates dev/runtime processes (Electron, Vite, MCP bridges, speech).
 * Cross-platform: Windows + macOS + Linux.
 *
 * SAFETY: Never kill all electron.exe — that would terminate Cursor IDE and other apps.
 *
 * Usage: npm run stop
 */

import { execSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appRootNorm = appRoot.replace(/\\/g, '/')
const appRootWin = appRoot.replace(/\//g, '\\')

function runPowerShell(script) {
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { stdio: 'inherit', windowsHide: true },
  )
}

/** True when this process clearly belongs to MetaMates (not Cursor / other Electron apps). */
function isMetaMatesProcessLine(name, commandLine) {
  const exe = (name || '').toLowerCase()
  const cmd = (commandLine || '').replace(/\\/g, '/')

  if (/^metamates\.exe$/i.test(name || '')) return true

  const underAppRoot =
    cmd.includes(appRootNorm) ||
    cmd.includes(appRootWin.replace(/\\/g, '/')) ||
    cmd.includes(appRootWin)

  if (!underAppRoot) {
    if (/vault-mcp-bridge\.mjs/i.test(cmd) && cmd.includes('metamates-app')) return true
    if (/ollama-acp-bridge\.mjs/i.test(cmd) && cmd.includes('metamates-app')) return true
    if (/win-unpacked[/\\]MetaMates/i.test(cmd)) return true
    return false
  }

  if (exe === 'electron.exe') {
    return (
      /dist-electron[/\\]main\.cjs/i.test(cmd) ||
      /metamates-app[/\\]\./i.test(cmd) ||
      /electron:dev/i.test(cmd) ||
      /win-unpacked/i.test(cmd)
    )
  }

  if (exe === 'node.exe') {
    return (
      /metamates-app[/\\]/i.test(cmd) &&
      (/vite/i.test(cmd) ||
        /concurrently/i.test(cmd) ||
        /wait-on/i.test(cmd) ||
        /electron/i.test(cmd) ||
        /vault-mcp-bridge/i.test(cmd) ||
        /ollama-acp-bridge/i.test(cmd) ||
        /compile-electron/i.test(cmd) ||
        /playwright/i.test(cmd))
    )
  }

  return false
}

function stopWindows() {
  const psFilter = appRootNorm.replace(/'/g, "''")
  runPowerShell(`
$appRoot = '${psFilter}'
$appRootWin = '${appRootWin.replace(/'/g, "''")}'
function Test-MetaMatesProcess([string]$name, [string]$cmd) {
  if ($name -match '^MetaMates\\.exe$') { return $true }
  if (-not $cmd) { return $false }
  $norm = $cmd -replace '\\\\','/'
  $underRoot = ($norm -match [regex]::Escape($appRoot)) -or ($cmd -match [regex]::Escape($appRootWin))
  if (-not $underRoot) {
    if ($cmd -match 'vault-mcp-bridge\\.mjs' -and $cmd -match 'metamates-app') { return $true }
    if ($cmd -match 'ollama-acp-bridge\\.mjs' -and $cmd -match 'metamates-app') { return $true }
    if ($cmd -match 'win-unpacked\\\\MetaMates') { return $true }
    return $false
  }
  if ($name -eq 'electron.exe') {
    return ($cmd -match 'dist-electron\\\\main\\.cjs') -or ($cmd -match 'metamates-app\\\\\\.') -or ($cmd -match 'electron:dev') -or ($cmd -match 'win-unpacked')
  }
  if ($name -eq 'node.exe') {
    return ($cmd -match 'metamates-app\\\\') -and ($cmd -match 'vite|concurrently|wait-on|electron|vault-mcp-bridge|ollama-acp-bridge|compile-electron|playwright')
  }
  return $false
}
$targets = Get-CimInstance Win32_Process | Where-Object {
  Test-MetaMatesProcess $_.Name $_.CommandLine
}
$count = @($targets).Count
Write-Host "Stopping $count MetaMates-related process(es)..."
foreach ($p in $targets) {
  try {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    Write-Host "  stopped PID $($p.ProcessId) $($p.Name)"
  } catch {
    Write-Host "  skip PID $($p.ProcessId): $_"
  }
}
Write-Host "Done."
`)
}

function stopUnix() {
  const patterns = [
    `${appRootNorm}.*electron`,
    `${appRootNorm}.*vite`,
    `${appRootNorm}.*vault-mcp-bridge`,
    `${appRootNorm}.*ollama-acp-bridge`,
    `${appRootNorm}.*concurrently`,
    `${appRootNorm}.*win-unpacked`,
  ]
  let stopped = 0
  for (const pattern of patterns) {
    try {
      execSync(`pkill -f "${pattern}"`, { stdio: 'ignore' })
      stopped++
    } catch {
      /* no match */
    }
  }
  console.log(stopped > 0 ? `Sent stop signal to matching processes (${stopped} pattern(s)).` : 'No matching MetaMates processes found.')
}

console.log(`MetaMates stop — app root: ${appRoot}`)
console.log('Note: this script only stops MetaMates dev/build processes — not Cursor or other Electron apps.')
if (process.platform === 'win32') {
  stopWindows()
} else {
  stopUnix()
}
