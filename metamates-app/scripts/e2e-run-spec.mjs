#!/usr/bin/env node
/** Run Playwright spec(s) with E2E_SPLIT=1. Extra args pass through to playwright (e.g. --grep "pattern"). */
import { spawnSync } from 'node:child_process'

const spec = process.argv[2]
const passthrough = process.argv.slice(3).filter((arg) => arg !== '--agent-live')
if (!spec) {
  console.error('Usage: node scripts/e2e-run-spec.mjs <spec-path> [playwright-args...]')
  process.exit(1)
}

process.env.E2E_SPLIT = '1'

if (process.argv.includes('--agent-live')) {
  process.env.E2E_AGENT_LIVE = '1'
}

const compile = spawnSync('npm run electron:compile', {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})
if (compile.status !== 0) {
  process.exit(compile.status ?? 1)
}

const args = ['playwright', 'test', spec, ...passthrough]

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})
process.exit(result.status ?? 1)
