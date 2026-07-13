import { defineConfig } from '@playwright/test'

const { resolveDefaultWorkspace } = await import('./scripts/lib/default-workspace.mjs')
process.env.METAMATES_WORKSPACE = resolveDefaultWorkspace()
process.env.METAMATES_E2E = '1'
process.env.METAMATES_PACKAGED = '1'
process.env.METAMATES_E2E_ALLOW_BUNDLED_PLUGINS = '1'

/** Packaged build E2E — no Vite dev server. */
export default defineConfig({
  testDir: './e2e',
  timeout: 480_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-packaged-results.json' }]],
  projects: [{
    name: 'packaged',
    testMatch: [
      'suite/29-packaged-smoke.spec.ts',
      'suite/30-packaged-empty-state-no-spinner.spec.ts',
      'suite/31-packaged-plugins-functional.spec.ts',
    ],
  }],
})
