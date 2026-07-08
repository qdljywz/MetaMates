import { describe, it, expect } from 'vitest'
import {
  resolveSpawnConfig,
  getDetectionCommand,
  POTENTIAL_ACP_CLIS,
  CODEX_ACP_NPX_PACKAGE,
  CLAUDE_ACP_NPX_PACKAGE,
} from '@acp-registry'

describe('acpRegistry spawn resolution', () => {
  it('should resolve claude via npx bridge', () => {
    const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === 'claude')!
    const spawn = resolveSpawnConfig(def)
    expect(spawn.cliPath).toMatch(/npx/)
    expect(spawn.acpArgs).toContain(CLAUDE_ACP_NPX_PACKAGE)
  })

  it('should resolve codex via codex-acp npx package', () => {
    const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === 'codex')!
    const spawn = resolveSpawnConfig(def)
    expect(spawn.cliPath).toMatch(/npx/)
    expect(spawn.acpArgs).toContain(CODEX_ACP_NPX_PACKAGE)
    expect(spawn.acpArgs).not.toContain('--experimental-acp')
  })

  it('should resolve goose with acp subcommand', () => {
    const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === 'goose')!
    const spawn = resolveSpawnConfig(def)
    expect(spawn.cliPath).toBe('goose')
    expect(spawn.acpArgs).toEqual(['acp'])
  })

  it('should use detectCmd for qoder', () => {
    const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === 'qoder')!
    expect(getDetectionCommand(def)).toBe('qodercli')
  })

  it('should resolve codebuddy via direct cmd when on PATH', () => {
    const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === 'codebuddy')!
    const spawn = resolveSpawnConfig(def, 'path')
    expect(spawn.cliPath).toBe('codebuddy')
    expect(spawn.acpArgs).toContain('--acp')
  })

  it('should resolve codebuddy via npx when only npm package detected', () => {
    const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === 'codebuddy')!
    const spawn = resolveSpawnConfig(def, 'npm-global')
    expect(spawn.cliPath).toMatch(/npx/)
  })
})
