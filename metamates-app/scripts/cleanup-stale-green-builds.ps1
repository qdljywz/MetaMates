# =============================================================================
# MetaMates — 删除陈旧绿色版 / release 打包目录（关 Cursor 后运行）
# =============================================================================
# 保留：
#   1) 最新绿色版（优先 release\portable-green-new，并改名为 portable-green）
#   2) release\ 下的 MetaMates-*.zip 插件包（发版用，体积小）
#
# 删除：所有其它绿色版副本、win-unpacked、docs-shot、以及项目根下
#       release-build* / release-local* / release2 / release-fresh* 等废目录
#
# 用法（请先完全退出 Cursor）：
#   双击：scripts\cleanup-stale-green-builds.bat
#   或：
#   powershell -ExecutionPolicy Bypass -File scripts\cleanup-stale-green-builds.ps1
# =============================================================================

$ErrorActionPreference = 'Continue'
$appRoot = Split-Path $PSScriptRoot -Parent
$release = Join-Path $appRoot 'release'

Write-Host ''
Write-Host '========================================'
Write-Host ' MetaMates stale green/release cleanup'
Write-Host '========================================'
Write-Host "App root: $appRoot"
Write-Host ''

# --- stop MetaMates if still running ---
Write-Host '[1/4] Stopping MetaMates.exe ...'
Get-Process MetaMates -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='MetaMates.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# --- find newest green build to keep ---
$candidates = @(
  (Join-Path $release 'portable-green-new\win-unpacked\MetaMates.exe'),
  (Join-Path $release 'portable-green\win-unpacked\MetaMates.exe')
)
$keepExe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $keepExe) {
  Write-Host 'ERROR: No MetaMates.exe found under portable-green-new or portable-green.'
  Write-Host 'Abort — nothing deleted.'
  Read-Host 'Press Enter to close'
  exit 1
}

$keepExeItem = Get-Item -LiteralPath $keepExe
Write-Host "[2/4] Keep green build:"
Write-Host "      $($keepExeItem.FullName)"
Write-Host "      LastWriteTime: $($keepExeItem.LastWriteTime)"
Write-Host ''

# --- promote portable-green-new -> portable-green ---
$greenNew = Join-Path $release 'portable-green-new'
$greenCanon = Join-Path $release 'portable-green'
$greenIsNew = $keepExe -like '*\portable-green-new\*'

function Remove-TreeForce([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return $true }
  $empty = Join-Path $env:TEMP ('mm-empty-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $empty -Force | Out-Null
  try {
    robocopy $empty $path /MIR /R:3 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  } finally {
    Remove-Item -LiteralPath $empty -Force -ErrorAction SilentlyContinue
  }
  return -not (Test-Path -LiteralPath $path)
}

Write-Host '[3/4] Promote latest green to release\portable-green ...'
if ($greenIsNew) {
  if (Test-Path -LiteralPath $greenCanon) {
    Write-Host "      removing old/broken portable-green ..."
    if (-not (Remove-TreeForce $greenCanon)) {
      Write-Host 'ERROR: Cannot remove old portable-green (still locked).'
      Write-Host 'Make sure Cursor is fully quit, then retry.'
      Read-Host 'Press Enter to close'
      exit 1
    }
  }
  Rename-Item -LiteralPath $greenNew -NewName 'portable-green'
  if (-not (Test-Path -LiteralPath (Join-Path $greenCanon 'win-unpacked\MetaMates.exe'))) {
    Write-Host 'ERROR: Rename to portable-green failed.'
    Read-Host 'Press Enter to close'
    exit 1
  }
  Write-Host '      OK → release\portable-green\win-unpacked\MetaMates.exe'
} else {
  Write-Host '      Already using portable-green (no rename needed)'
}

# --- collect delete targets ---
$targets = [System.Collections.Generic.List[string]]::new()

# Under release/: delete every directory except portable-green
if (Test-Path -LiteralPath $release) {
  Get-ChildItem -LiteralPath $release -Directory -Force | Where-Object {
    $_.Name -ne 'portable-green'
  } | ForEach-Object { $targets.Add($_.FullName) }
}

# App-root legacy release folders
Get-ChildItem -LiteralPath $appRoot -Directory -Force | Where-Object {
  $_.Name -match '^(release-build|release-local|release2|release-fresh|release-out|release-startup)(-|$)' `
    -or $_.Name -eq 'release2' `
    -or $_.Name -eq 'release-out' `
    -or $_.Name -eq 'release-fresh' `
    -or $_.Name -eq 'release-fresh2' `
    -or $_.Name -eq 'release-startup' `
    -or $_.Name -eq 'release-startup2'
} | ForEach-Object { $targets.Add($_.FullName) }

# Deduplicate
$targets = @($targets | Select-Object -Unique)

Write-Host ''
Write-Host "[4/4] Deleting $($targets.Count) stale folder(s) ..."
$failed = @()
$okCount = 0
foreach ($dir in $targets) {
  Write-Host "  - $dir"
  if (Remove-TreeForce $dir) {
    Write-Host '      OK'
    $okCount++
  } else {
    Write-Host '      FAIL (locked)'
    $failed += $dir
  }
}

Write-Host ''
Write-Host '========================================'
Write-Host " Removed OK: $okCount"
if ($failed.Count -gt 0) {
  Write-Host " Still locked: $($failed.Count)"
  $failed | ForEach-Object { Write-Host "   $_" }
  Write-Host ''
  Write-Host 'Close Cursor completely (check Task Manager for Cursor.exe), then run again.'
} else {
  Write-Host ' All stale folders removed.'
}
Write-Host ''
Write-Host ' Kept:'
Write-Host '   release\portable-green\win-unpacked\MetaMates.exe'
Get-ChildItem -LiteralPath $release -Filter 'MetaMates-*.zip' -File -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host "   release\$($_.Name)" }
Write-Host ''
Write-Host ' Remaining under release/:'
Get-ChildItem -LiteralPath $release -Force | ForEach-Object {
  Write-Host "   $($_.Name)"
}
Write-Host '========================================'

$finalExe = Join-Path $release 'portable-green\win-unpacked\MetaMates.exe'
if (Test-Path -LiteralPath $finalExe) {
  explorer.exe (Join-Path $release 'portable-green\win-unpacked')
}

if ($failed.Count -gt 0) {
  Read-Host 'Press Enter to close'
  exit 1
}

Read-Host 'Done. Press Enter to close'
exit 0
