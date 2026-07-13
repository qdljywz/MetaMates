#!/usr/bin/env node
/**
 * Dev-mode Claude E2E — minimal restarts.
 *
 * Launch 1: suite/06-full-journey.spec.ts (28 serial steps, one Electron, incl. agent 25–27)
 * Launch 2: suite/27-comprehensive-final-audit.spec.ts (UI exhaust, one Electron)
 *
 * Does NOT run E2E_SPLIT (that restarts Electron per spec file and duplicates journey coverage).
 * Does NOT re-run suite/28-claude-agent-live (agent steps already in journey 25–27).
 *
 * Usage: npm run test:e2e:dev-claude-complete
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = path.join(ROOT, 'dev-e2e-claude-complete-report.json')
const steps = []

function run(name, cmd, args = [], extraEnv = {}) {
  console.log(`\n[dev-e2e-complete] ▶ ${name}`)
  const started = Date.now()
  const env = {
    ...process.env,
    E2E_AGENT_LIVE: '1',
    E2E_AGENT_BACKEND: 'claude',
    ...extraEnv,
  }
  delete env.E2E_SPLIT
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  })
  const ok = result.status === 0
  steps.push({ name, ok, ms: Date.now() - started })
  if (!ok) {
    writeReport(false, name)
    process.exit(result.status ?? 1)
  }
  console.log(`[dev-e2e-complete] ✓ ${name}`)
}

function writeReport(passed, failedStep = '') {
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ passed, failedStep, finishedAt: new Date().toISOString(), steps }, null, 2),
    'utf8',
  )
}

console.log('[dev-e2e-complete] 2 launches: journey (28 steps) → audit (UI)')

run('Claude ping smoke', 'npm', ['run', 'verify:claude-ping'])
run('Launch 1 — full journey single session (28 steps)', 'node', [
  'scripts/playwright-e2e.mjs',
  'single-session',
])
run('Launch 2 — comprehensive UI audit', 'node', ['scripts/playwright-e2e.mjs', 'audit'])

writeReport(true)
console.log(`\n[dev-e2e-complete] ALL PASS — report: ${reportPath}`)
