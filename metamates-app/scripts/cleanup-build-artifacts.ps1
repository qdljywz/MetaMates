# 清理历史打包产物与废止目录（无需保留，可随时 electron:build 重建）
# 用法:
#   cd metamates-app
#   npm run clean:artifacts
#
# 若 FAIL：多为 Cursor 打开了工作区内 app.asar。请关闭 Cursor 后在外部 PowerShell 重跑；
# 或使用 -ScheduleReboot 在下次重启时删除。

param([switch]$ScheduleReboot)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MetamatesKernel32 {
  public const int MOVEFILE_DELAY_UNTIL_REBOOT = 4;
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
}
"@

$appRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $appRoot -Parent

Get-Process electron, Metamates -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'Metamates\\metamates-app' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 2

$empty = Join-Path $env:TEMP "metamates-empty-$(Get-Random)"
New-Item -ItemType Directory -Path $empty -Force | Out-Null

function Schedule-DeleteOnReboot($path) {
  if (-not (Test-Path $path)) { return $true }
  Get-ChildItem $path -Recurse -Force -File | ForEach-Object {
    [MetamatesKernel32]::MoveFileEx($_.FullName, $null, [MetamatesKernel32]::MOVEFILE_DELAY_UNTIL_REBOOT) | Out-Null
  }
  Get-ChildItem $path -Recurse -Force -Directory | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
    [MetamatesKernel32]::MoveFileEx($_.FullName, $null, [MetamatesKernel32]::MOVEFILE_DELAY_UNTIL_REBOOT) | Out-Null
  }
  return [MetamatesKernel32]::MoveFileEx($path, $null, [MetamatesKernel32]::MOVEFILE_DELAY_UNTIL_REBOOT)
}

function Remove-Tree($path) {
  if (-not (Test-Path $path)) { return $true }
  robocopy $empty $path /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  Remove-Item $path -Recurse -Force
  return -not (Test-Path $path)
}

function Collect-ReleaseDirs($root) {
  if (-not (Test-Path $root)) { return @() }
  Get-ChildItem $root -Directory -Force | Where-Object {
    $_.Name -match '^(dist-release|release-build|release)(-|$)' -or $_.Name -eq 'acp-poc' -or $_.Name -eq 'poc'
  } | ForEach-Object { $_.FullName }
}

$staticTargets = @(
  (Join-Path $appRoot 'dist'),
  (Join-Path $appRoot 'dist-electron'),
  (Join-Path $repoRoot 'metamates-opensource'),
  (Join-Path $repoRoot 'metamates-opensource-backup-20260412'),
  (Join-Path $repoRoot 'AionUi-source'),
  (Join-Path $repoRoot 'terminal-test'),
  (Join-Path $repoRoot 'backup')
)

$targets = @($staticTargets)
$targets += Collect-ReleaseDirs $appRoot
$targets += Collect-ReleaseDirs (Join-Path $repoRoot 'metamates-opensource')
$targets += Collect-ReleaseDirs (Join-Path $repoRoot 'metamates-opensource-backup-20260412')
$targets = $targets | Sort-Object -Unique

$failed = @()
foreach ($t in $targets) {
  if (Remove-Tree $t) {
    Write-Host "OK  $t"
    continue
  }
  if ($ScheduleReboot) {
    if (Schedule-DeleteOnReboot $t) {
      Write-Host "REBOOT  $t (scheduled for deletion on next reboot)"
    } else {
      Write-Host "FAIL $t"
      $failed += $t
    }
  } else {
    Write-Host "FAIL $t (file locked - close Cursor and retry, or use -ScheduleReboot)"
    $failed += $t
  }
}

Remove-Item $empty -Force

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "$($failed.Count) path(s) still locked. Close Cursor completely, then re-run:"
  Write-Host "  npm run clean:artifacts"
  if (-not $ScheduleReboot) {
    Write-Host "Or: npm run clean:artifacts:reboot"
  }
  exit 1
} else {
  Write-Host ""
  Write-Host "Done. Dev: npm run electron:compile && npm run start"
}
