import { describe, expect, it } from 'vitest'
import { resolveAcpFailure } from './acpFailureResolution'
import { getModeOptionsForBackend } from './agentModes'

describe('resolveAcpFailure', () => {
  it('detects quota and auth failures', () => {
    expect(resolveAcpFailure({ quotaExceeded: true }).action).toBe('switch_agent')
    expect(resolveAcpFailure({ authRequired: true }).action).toBe('auth')
  })

  it('detects disconnect errors', () => {
    expect(resolveAcpFailure({ error: 'Process exited' }).action).toBe('reconnect')
  })
})

describe('getModeOptionsForBackend', () => {
  it('returns codex-specific modes', () => {
    const modes = getModeOptionsForBackend('codex').map((m) => m.value)
    expect(modes).toContain('read-only')
    expect(modes).toContain('yolo')
  })

  it('falls back for unknown backends', () => {
    expect(getModeOptionsForBackend('unknown').length).toBeGreaterThan(0)
  })
})
