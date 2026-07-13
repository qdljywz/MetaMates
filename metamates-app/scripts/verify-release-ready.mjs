#!/usr/bin/env node
/**
 * One-shot release gate for Windows: artifacts + packaged smoke + plugin zips.
 * Usage: node scripts/verify-release-ready.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version || '0.1.0'
const reportPath = path.join(ROOT, 'release-ready-report.json')

const steps = []
function run(name, cmd, args = [], env = {}) {
  console.log(`\n[release-ready] ▶ ${name}`)
  const started = Date.now()
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  const ok = result.status === 0
  steps.push({ name, ok, ms: Date.now() - started })
  if (!ok) {
    console.error(`[release-ready] ✗ ${name}`)
    writeReport(false)
    process.exit(result.status ?? 1)
  }
  console.log(`[release-ready] ✓ ${name}`)
}

function assertFile(label, relPath) {
  const full = path.join(ROOT, relPath)
  const ok = fs.existsSync(full)
  steps.push({ name: `artifact: ${label}`, ok, path: relPath })
  if (!ok) {
    console.error(`[release-ready] ✗ missing ${relPath}`)
    writeReport(false)
    process.exit(1)
  }
  console.log(`[release-ready] ✓ ${relPath}`)
}

function writeReport(passed) {
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ passed, version, finishedAt: new Date().toISOString(), steps }, null, 2),
    'utf8',
  )
}

console.log('[release-ready] Windows release gate — version', version)

assertFile('MetaMates.exe', path.join('release', 'win-unpacked', 'MetaMates.exe'))
assertFile('NSIS installer', path.join('release', `MetaMates-${version}-win-x64.exe`))
assertFile('document-import zip', path.join('release', `MetaMates-document-import-${version}-win-x64.zip`))
assertFile('offline-speech zip', path.join('release', `MetaMates-offline-speech-${version}-win-x64.zip`))

run('asar integrity', 'npm', ['run', 'electron:pack:verify-asar'])
run('fresh-user packaged DB', 'npm', ['run', 'verify:fresh-user'], {
  METAMATES_PACKAGED_EXE: path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe'),
})
run('plugin zip install probe', 'npm', ['run', 'verify:plugin-zip-install'])
run('packaged E2E smoke', 'npx', ['playwright', 'test', '--config=playwright.packaged.config.ts'])

writeReport(true)
console.log('\n[release-ready] ALL PASS — report:', reportPath)
