import { defineConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'url'

const require = createRequire(fileURLToPath(import.meta.url))
const { resolveDefaultWorkspace } = require('./scripts/lib/default-workspace.mjs') as {
  resolveDefaultWorkspace: () => string
}

const ROOT = path.dirname(fileURLToPath(import.meta.url))

function resolvePackagedExe(): string {
  const fromEnv = process.env.METAMATES_PACKAGED_EXE?.trim()
  const candidates = [
    fromEnv,
    path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'unpacked-fix', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe'),
  ].filter(Boolean) as string[]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    throw new Error('Packaged MetaMates.exe not found — set METAMATES_PACKAGED_EXE')
  }
  return found
}

process.env.METAMATES_WORKSPACE = resolveDefaultWorkspace()
process.env.METAMATES_E2E = '1'
process.env.METAMATES_PACKAGED = '1'
process.env.METAMATES_PACKAGED_EXE = resolvePackagedExe()
process.env.E2E_AGENT_LIVE = '1'
process.env.E2E_AGENT_BACKEND = process.env.E2E_AGENT_BACKEND?.trim() || 'claude'

/** Packaged agent-live (Claude by default) — journey steps 25–27 + Claude live spec. Consumes CLI quota. */
export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-packaged-agent-live-results.json' }]],
  projects: [
    { name: 'journey-agent-live', testMatch: 'suite/06-full-journey.spec.ts', grep: /@agent-live/ },
    { name: 'claude-live', testMatch: 'suite/28-claude-agent-live.spec.ts' },
  ],
})
