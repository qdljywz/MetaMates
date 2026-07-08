import { defineConfig } from '@playwright/test'

process.env.METAMATES_WORKSPACE = process.env.METAMATES_WORKSPACE?.trim() || 'E:\\MyM2'
process.env.METAMATES_E2E = '1'

/** Default: journey project only (E2E_SINGLE_SESSION in spec beforeAll). E2E_SPLIT=1 = per-area debug specs. */
const splitMode = process.env.E2E_SPLIT === '1'

const shared = {
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  // Agent-live retries double CodeBuddy/Gemini quota — never retry those runs.
  retries: process.env.E2E_AGENT_LIVE === '1' ? 0 : process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-results.json' }]],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    trace: 'on-first-retry',
    baseURL: 'http://127.0.0.1:3000',
  },
}

export default defineConfig(
  splitMode
    ? {
        ...shared,
        testMatch: ['suite/**/*.spec.ts', '!suite/06-full-journey.spec.ts'],
      }
    : {
        ...shared,
        projects: [
          { name: 'journey', testMatch: 'suite/06-full-journey.spec.ts' },
          { name: 'guardrails', testMatch: '*-ux-guardrails.spec.ts' },
        ],
      },
)
