#!/usr/bin/env node
/**
 * Overnight acceptance pipeline: unit guardrails → portable build → plugin auto-install → packaged E2E.
 * Writes metamates-app/acceptance-report.json summary.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SUMMARY = path.join(ROOT, 'acceptance-report.json')

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n[overnight] === ${label} ===`)
  const started = Date.now()
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  })
  const elapsedMs = Date.now() - started
  const ok = r.status === 0
  console.log(`[overnight] ${label}: ${ok ? 'PASS' : 'FAIL'} (${Math.round(elapsedMs / 1000)}s)`)
  return { label, ok, elapsedMs, exitCode: r.status ?? 1 }
}

const exe = path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const steps = []

steps.push(run('unit:ux-guardrails', 'npm', ['run', 'test:ux-guardrails']))

if (!fs.existsSync(exe)) {
  steps.push(
    run('build:portable-green', 'npx', [
      'electron-builder',
      '--config',
      'electron-builder.yml',
      '--dir',
      '--win',
      '--x64',
      '-c.directories.output=release/portable-green',
    ]),
  )
}

if (fs.existsSync(exe)) {
  steps.push(run('verify:acceptance-portable', 'node', ['scripts/verify-acceptance-portable.mjs'], {
    METAMATES_PACKAGED_EXE: exe,
  }))
  steps.push(run('test:e2e:packaged:full', 'npm', ['run', 'test:e2e:packaged:full'], {
    METAMATES_PACKAGED_EXE: exe,
  }))
} else {
  console.error('[overnight] portable-green exe missing after build')
}

const summary = {
  generatedAt: new Date().toISOString(),
  exe: fs.existsSync(exe) ? exe : null,
  steps,
  ok: steps.every((s) => s.ok),
}

if (fs.existsSync(SUMMARY)) {
  try {
    const prior = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'))
    summary.acceptancePortable = prior.checks ?? prior
  } catch {
    /* ignore */
  }
}

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2))
console.log('\n[overnight] Summary →', SUMMARY)
process.exit(summary.ok ? 0 : 1)
