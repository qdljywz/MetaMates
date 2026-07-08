import { describe, expect, it } from 'vitest'
import {
  assessVaultPermission,
  FORBIDDEN_EXTERNAL_SHELL_PATTERNS,
} from '../../electron/shared/vaultPermissionGuard'

describe('vaultPermissionGuard', () => {
  const workspace = 'E:\\MyM2'

  it('allows in-vault write paths', () => {
    const result = assessVaultPermission(workspace, {
      title: 'Write 2026-06-23 PLAN.md',
      kind: 'edit',
      rawInput: { path: '01_日记与计划/2026-06-23 PLAN.md' },
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks write paths outside vault', () => {
    const result = assessVaultPermission(workspace, {
      title: 'Write MEMORY.md',
      kind: 'edit',
      rawInput: { path: 'C:/Users/Administrator/.codebuddy/projects/e-MyM2/memory/MEMORY.md' },
    })
    expect(result.allowed).toBe(false)
    expect(result.blockedPaths?.length).toBeGreaterThan(0)
  })

  it('blocks shell redirect to ~/.codebuddy', () => {
    const result = assessVaultPermission(workspace, {
      title: 'run_terminal_cmd',
      kind: 'execute',
      rawInput: {
        command: 'echo test >> C:/Users/Administrator/.codebuddy/projects/e-MyM2/memory/MEMORY.md',
      },
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/CLI cache|outside/i)
  })

  it('allows benign shell inside workspace', () => {
    const result = assessVaultPermission(workspace, {
      title: 'run_terminal_cmd',
      kind: 'execute',
      rawInput: { command: 'dir E:\\MyM2\\01_日记与计划' },
    })
    expect(result.allowed).toBe(true)
  })

  it('forbidden patterns cover codebuddy project dir', () => {
    const sample = 'write to ~/.codebuddy/projects/foo/memory/MEMORY.md'
    expect(FORBIDDEN_EXTERNAL_SHELL_PATTERNS.some((p) => p.test(sample))).toBe(true)
  })
})
