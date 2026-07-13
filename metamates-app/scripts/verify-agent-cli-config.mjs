#!/usr/bin/env node
/**
 * Agent CLI config verification — compile + Claude settings smoke + unit tests.
 * Set VERIFY_AGENT_CLI_E2E=1 or pass --e2e to also run lazy-warmup + suite/24 E2E.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const runE2e = process.argv.includes('--e2e') || process.env.VERIFY_AGENT_CLI_E2E === '1'

function run(cmd, args, label) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error(`FAIL: ${label}`)
    process.exit(result.status ?? 1)
  }
  console.log(`OK: ${label}`)
}

run('npx', ['tsc', '--noEmit'], 'tsc --noEmit')
run('npm', ['run', 'electron:compile'], 'electron:compile')

if (!existsSync(join(ROOT, 'dist-electron', 'agentCliConfig.cjs'))) {
  console.error('Missing dist-electron/agentCliConfig.cjs after compile')
  process.exit(1)
}

run('node', ['scripts/verify-claude-settings-first.mjs'], 'verify-claude-settings-first')

run(
  'npx',
  [
    'vitest',
    'run',
    'src/utils/agentCliConfigPolicy.test.ts',
    'src/hooks/useAgentRuntime.test.ts',
  ],
  'vitest agent-cli-config',
)

if (runE2e) {
  run('npm', ['run', 'test:e2e:lazy-warmup'], 'test:e2e:lazy-warmup')
  run('npm', ['run', 'test:e2e:agent-recent'], 'test:e2e:agent-recent')
}

console.log(`\nverify-agent-cli-config: all checks passed${runE2e ? ' (with E2E)' : ''}`)
