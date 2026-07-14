import { defineConfig } from '@playwright/test'

const { resolveDefaultWorkspace } = await import('./scripts/lib/default-workspace.mjs')
process.env.METAMATES_WORKSPACE = resolveDefaultWorkspace()
process.env.METAMATES_E2E = '1'
/** Dev Electron + Vite — same path as normal E2E. Do NOT use portable-green (zombie exe). */
delete process.env.METAMATES_PACKAGED
delete process.env.METAMATES_PACKAGED_EXE
delete process.env.METAMATES_E2E_NO_AGENTS

/**
 * README screenshots against the development build.
 * Requires Vite on :3000 (webServer below).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  projects: [{
    name: 'docs-screenshots',
    testMatch: ['suite/33-docs-screenshots.spec.ts'],
  }],
})
