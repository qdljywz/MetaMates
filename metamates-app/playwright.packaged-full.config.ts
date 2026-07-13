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
    path.join(ROOT, 'release', 'unpacked-1307', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe'),
  ].filter(Boolean) as string[]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    throw new Error(
      'Packaged MetaMates.exe not found — set METAMATES_PACKAGED_EXE or run npm run electron:build:win:portable',
    )
  }
  return found
}

process.env.METAMATES_WORKSPACE = resolveDefaultWorkspace()
process.env.METAMATES_E2E = '1'
process.env.METAMATES_PACKAGED = '1'
process.env.METAMATES_PACKAGED_EXE = resolvePackagedExe()

/** Full E2E (journey + audit + guardrails) against win-unpacked — no Vite dev server. */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-packaged-full-results.json' }]],
  projects: [
    { name: 'journey', testMatch: 'suite/06-full-journey.spec.ts' },
    { name: 'audit', testMatch: 'suite/27-comprehensive-final-audit.spec.ts' },
    {
      name: 'guardrails',
      testMatch: [
        '*-ux-guardrails.spec.ts',
        'lazy-warmup.spec.ts',
        'suite/22-offline-speech-plugin.spec.ts',
        'suite/23-document-import-plugin.spec.ts',
        'suite/25-agent-recent-changes.spec.ts',
        'suite/29-packaged-smoke.spec.ts',
        'suite/30-packaged-empty-state-no-spinner.spec.ts',
      ],
    },
  ],
})
