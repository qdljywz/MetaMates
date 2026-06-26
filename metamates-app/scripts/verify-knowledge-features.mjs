#!/usr/bin/env node
/**
 * Verify P1–P3 via vitest (linkIntelligence + agentConnectionStatus).
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'vitest',
    'run',
    'src/services/linkIntelligence.test.ts',
    'src/utils/agentConnectionStatus.test.ts',
    'src/utils/yoloAcknowledgment.test.ts',
    'src/test/acpSpawn.test.ts',
    'src/commands/slashWritePolicy.test.ts',
    'src/commands/slashWritebackVerify.test.ts',
    'src/test/agentSlashCommands.test.ts',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
console.log('\nAll P1–P3 knowledge feature unit tests passed.')
