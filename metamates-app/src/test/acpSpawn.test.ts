import { describe, expect, it, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'

vi.mock('../../electron/shellEnv', () => ({
  prepareCleanEnv: (customEnv?: Record<string, string>) => ({
    ...process.env,
    ...customEnv,
    PATH: process.env.PATH || '',
  }),
  resolveNpxPath: () => (process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\npx.cmd' : 'npx'),
  resolveNpxSpawnCwd: () => path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
}))

import { createSpawnConfigFromResolved } from '../../electron/acp/acpSpawn'

describe('acpSpawn cwd', () => {
  const workspace = path.join('E:', 'MyM2')

  it('uses workspace cwd for npx-backed CLIs when workspace is set', () => {
    const config = createSpawnConfigFromResolved('npx.cmd', ['--yes', '@zed-industries/claude-code-acp'], workspace)
    expect(config.options.cwd).toBe(path.resolve(workspace))
  })

  it('uses workspace cwd for direct CLI binary', () => {
    const cli = process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\claude.cmd' : '/usr/local/bin/claude'
    const config = createSpawnConfigFromResolved(cli, ['--experimental-acp'], workspace)
    expect(config.options.cwd).toBe(path.resolve(workspace))
  })

  it('falls back when workspace is empty', () => {
    const config = createSpawnConfigFromResolved('npx.cmd', ['--yes', 'pkg'], '')
    expect(config.options.cwd).not.toBe('')
    const cwd = String(config.options.cwd ?? '')
    expect(cwd === os.homedir() || /nodejs|npm/i.test(cwd)).toBe(true)
  })
})
