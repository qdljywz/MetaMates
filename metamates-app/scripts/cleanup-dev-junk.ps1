# Remove legacy dev junk and test run artifacts from metamates-app.
# Keeps: src/test/ (unit tests), e2e/*.spec.ts (Playwright), scripts/full-functional-test.mjs
#
# Usage:
#   cd metamates-app
#   npm run clean:junk

$ErrorActionPreference = 'SilentlyContinue'
$appRoot = Split-Path $PSScriptRoot -Parent

$filePatterns = @(
  '*-test.cjs',
  '*-test.js',
  'test-*.cjs',
  'test-*.js',
  'quick-verify.cjs',
  'final-verify.cjs',
  'auto-test-*.cjs',
  'e2e-*.cjs',
  '*-report.json',
  'full-functional-test-report.json',
  'overnight-verify*',
  'functional-test-*.png',
  'electron-*.log',
  'conversations.db.bak',
  'tsconfig.node.tsbuildinfo'
)

$dirTargets = @(
  'test-results',
  'playwright-report',
  'coverage',
  'test-workspace',
  'tests'
)

$obsoleteFiles = @(
  (Join-Path $appRoot 'e2e\acp-poc.spec.ts')
)

$removed = 0
$bytes = 0

function Remove-ItemCounted($path) {
  if (-not (Test-Path $path)) { return }
  if (Test-Path $path -PathType Leaf) {
    $item = Get-Item $path
    $script:bytes += $item.Length
    Remove-Item $path -Force
  } else {
    $size = (Get-ChildItem $path -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($size) { $script:bytes += $size }
    Remove-Item $path -Recurse -Force
  }
  Write-Host "OK  $($path.Replace($appRoot + '\', ''))"
  $script:removed++
}

foreach ($pat in $filePatterns) {
  Get-ChildItem -Path $appRoot -Filter $pat -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $bytes += $_.Length
    Remove-Item $_.FullName -Force
    Write-Host "OK  $($_.Name)"
    $removed++
  }
}

foreach ($dir in $dirTargets) {
  Remove-ItemCounted (Join-Path $appRoot $dir)
}

foreach ($file in $obsoleteFiles) {
  Remove-ItemCounted $file
}

Write-Host ""
if ($removed -eq 0) {
  Write-Host "Nothing to remove."
} else {
  Write-Host "Removed $removed item(s), freed $([math]::Round($bytes / 1MB, 2)) MB."
}
Write-Host "Kept: src/test/, e2e/*.spec.ts (formal test suites)"
