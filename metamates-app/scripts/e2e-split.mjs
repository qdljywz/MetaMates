#!/usr/bin/env node
/** Run per-area E2E specs (each launches Electron). Default `npm run test:e2e` uses single-session journey only. */
import { spawnSync } from 'node:child_process'

process.env.E2E_SPLIT = '1'
const result = spawnSync('npx', ['playwright', 'test'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})
process.exit(result.status ?? 1)
