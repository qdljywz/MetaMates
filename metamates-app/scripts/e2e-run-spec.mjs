#!/usr/bin/env node
/** Run Playwright spec(s) with E2E_SPLIT=1. Extra args pass through to playwright (e.g. --grep "pattern"). */
import { spawnSync } from 'node:child_process'

const spec = process.argv[2]
const passthrough = process.argv.slice(3).filter((arg) => arg !== '--agent-live' && arg !== '--claude' && arg !== '--full-writeback' && arg !== '--agent-write' && arg !== '--dev')
if (!spec) {
  console.error('Usage: node scripts/e2e-run-spec.mjs <spec-path> [playwright-args...]')
  process.exit(1)
}

process.env.E2E_SPLIT = '1'

if (process.argv.includes('--dev')) {
  process.env.METAMATES_PACKAGED = '0'
}

if (process.argv.includes('--agent-live')) {
  process.env.E2E_AGENT_LIVE = '1'
}

if (process.argv.includes('--claude')) {
  process.env.E2E_AGENT_BACKEND = 'claude'
}

if (process.argv.includes('--full-writeback')) {
  process.env.E2E_CLAUDE_FULL_WRITEBACK = '1'
}

if (process.argv.includes('--agent-write')) {
  process.env.E2E_CLAUDE_AGENT_WRITE = '1'
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
