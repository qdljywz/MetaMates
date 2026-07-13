#!/usr/bin/env node
/**
 * Run Playwright with a stable config — clears E2E_SPLIT so journey/guardrails projects apply.
 * Usage: node scripts/playwright-e2e.mjs [journey|guardrails|full|audit|agent-live|single-session|max]
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mode = (process.argv[2] || 'journey').toLowerCase()

delete process.env.E2E_SPLIT

function runPlaywright(project) {
  const args = ['playwright', 'test']
  if (project) args.push(`--project=${project}`)
  return spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit', shell: true })
}

let status = 0
if (mode === 'single-session' || mode === 'agent-live') {
  process.env.E2E_AGENT_LIVE = '1'
  process.env.E2E_AGENT_BACKEND = process.env.E2E_AGENT_BACKEND || 'claude'
  // One Electron launch — suite/06-full-journey.spec.ts (28 serial steps, incl. agent 25–27).
  status = runPlaywright('journey').status ?? 1
} else if (mode === 'max') {
  process.env.E2E_MAX = '1'
  process.env.E2E_AGENT_LIVE = process.env.E2E_AGENT_LIVE || '1'
  process.env.E2E_AGENT_BACKEND = process.env.E2E_AGENT_BACKEND || 'claude'
  // One Playwright invocation, ~8 Electron launches (see playwright.config.ts maxMode projects).
  status = runPlaywright().status ?? 1
} else if (mode === 'full') {
  status = runPlaywright('journey').status ?? 1
  if (status === 0) status = runPlaywright('audit').status ?? 1
  if (status === 0) status = runPlaywright('guardrails').status ?? 1
} else if (mode === 'audit') {
  status = runPlaywright('audit').status ?? 1
} else if (mode === 'guardrails') {
  status = runPlaywright('guardrails').status ?? 1
} else {
  status = runPlaywright('journey').status ?? 1
}

process.exit(status)
