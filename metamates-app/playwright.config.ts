import { defineConfig } from '@playwright/test'

const { resolveDefaultWorkspace } = await import('./scripts/lib/default-workspace.mjs')
process.env.METAMATES_WORKSPACE = resolveDefaultWorkspace()
process.env.METAMATES_E2E = '1'

/** Default: journey project only (E2E_SINGLE_SESSION in spec beforeAll). E2E_SPLIT=1 = per-area debug specs (many restarts). */
const splitMode = process.env.E2E_SPLIT === '1'
/** E2E_MAX=1: maximal feature coverage with ~8 Electron launches (see npm run test:e2e:max). */
const maxMode = process.env.E2E_MAX === '1'

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
        testMatch: ['suite/**/*.spec.ts', 'lazy-warmup.spec.ts', '!suite/06-full-journey.spec.ts'],
      }
    : maxMode
      ? {
          ...shared,
          projects: [
            // ~8 launches: core journey + UI audit + unique split specs + plugins + agent regression.
            // Skips suite/01–13 duplicates, agent-live 17/19/28 (covered by journey 25–27), packaged 29.
            { name: 'max-journey', testMatch: 'suite/06-full-journey.spec.ts' },
            { name: 'max-audit', testMatch: 'suite/27-comprehensive-final-audit.spec.ts' },
            {
              name: 'max-supplement',
              testMatch: [
                'suite/14-editor-trust.spec.ts',
                'suite/16-vault-capture.spec.ts',
                'suite/20-workspace-dirty-guard.spec.ts',
              ],
            },
            {
              name: 'max-plugins',
              testMatch: [
                'suite/22-offline-speech-plugin.spec.ts',
                'suite/23-document-import-plugin.spec.ts',
              ],
            },
            { name: 'max-agent', testMatch: 'suite/25-agent-recent-changes.spec.ts' },
          ],
        }
      : {
          ...shared,
          projects: [
            // Each project = one Electron launch (beforeAll in that spec file).
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
              ],
            },
          ],
        },
)
