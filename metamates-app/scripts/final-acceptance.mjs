#!/usr/bin/env node
/**
 * Final acceptance gate (no full 16min E2E) — portable-green smoke checks.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE = path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const REPORT = path.join(ROOT, 'acceptance-report.json')

function run(label, cmd, args, env = {}) {
  console.log(`\n[final] === ${label} ===`)
  const started = Date.now()
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, METAMATES_PACKAGED_EXE: EXE, ...env },
  })
  const ok = r.status === 0
  console.log(`[final] ${label}: ${ok ? 'PASS' : 'FAIL'} (${Math.round((Date.now() - started) / 1000)}s)`)
  return { label, ok, elapsedMs: Date.now() - started }
}

if (!fs.existsSync(EXE)) {
  console.error('[final] Missing', EXE)
  process.exit(1)
}

const steps = [
  run('verify:document-import-real', 'npm', ['run', 'verify:document-import-real']),
  run('verify:offline-speech-dev', 'npm', ['run', 'verify:offline-speech-dev']),
  run('verify:acceptance-portable', 'npm', ['run', 'verify:acceptance-portable']),
  run('test:e2e:packaged:empty-state', 'npm', ['run', 'test:e2e:packaged:empty-state']),
  run('test:e2e:packaged:plugins', 'npm', ['run', 'test:e2e:packaged:plugins']),
]

const ok = steps.every((s) => s.ok)
let merged = { generatedAt: new Date().toISOString(), finalAcceptance: { ok, steps } }
if (fs.existsSync(REPORT)) {
  try {
    merged = { ...JSON.parse(fs.readFileSync(REPORT, 'utf8')), ...merged }
  } catch {
    /* ignore */
  }
}
merged.status = ok ? 'READY' : 'FAILED'
fs.writeFileSync(REPORT, JSON.stringify(merged, null, 2))
console.log('\n[final] report →', REPORT)
process.exit(ok ? 0 : 1)
