#!/usr/bin/env node
/**
 * Max coverage with minimal Electron restarts.
 *
 * Phase 0 (no UI): unit + functional + slash + UX guardrails unit
 * Phase 1 E2E:     npm run test:e2e:max  (~8 Electron launches, ~90+ UI cases)
 *
 * Launch map (E2E_MAX=1):
 *   1  journey (28 steps, incl. agent 25–27 when E2E_AGENT_LIVE=1)
 *   2  comprehensive audit (18 steps)
 *   3  editor-trust (4)
 *   4  vault-capture (2)
 *   5  workspace-dirty-guard (2)
 *   6–7 offline-speech plugin (2, special launch flags)
 *   8–9 document-import plugin (2)
 *  10  agent-recent regression
 *
 * Not included (run separately when needed):
 *   test:e2e:split        — 25+ launches, every per-area spec
 *   test:e2e:packaged     — packaged exe smoke
 *   test:e2e:claude-agent-live — extra Claude-only steps (overlap journey 25–27)
 *   lazy-warmup / ux-guardrails E2E — covered by unit test:ux-guardrails + journey
 *
 * Usage: npm run test:all:max
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = path.join(ROOT, 'e2e-max-coverage-report.json')
const steps = []

function run(name, cmd, args = [], extraEnv = {}) {
  console.log(`\n[max-coverage] ▶ ${name}`)
  const started = Date.now()
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  })
  const ok = result.status === 0
  steps.push({ name, ok, ms: Date.now() - started })
  if (!ok) {
    writeReport(false, name)
    process.exit(result.status ?? 1)
  }
  console.log(`[max-coverage] ✓ ${name}`)
}

function writeReport(passed, failedStep = '') {
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ passed, failedStep, finishedAt: new Date().toISOString(), steps }, null, 2),
    'utf8',
  )
}

console.log('[max-coverage] Phase 0: unit + functional (no Electron UI)')
run('Typecheck + vitest + functional', 'npm', ['run', 'verify:round'])
run('Slash commands', 'npm', ['run', 'test:slash'])
run('UX guardrails (unit)', 'npm', ['run', 'test:ux-guardrails'])

console.log('\n[max-coverage] Phase 1: E2E max (~8 Electron launches)')
run('Claude ping smoke', 'npm', ['run', 'verify:claude-ping'])
run('E2E max coverage', 'npm', ['run', 'test:e2e:max'])

writeReport(true)
console.log(`\n[max-coverage] ALL PASS — report: ${reportPath}`)
