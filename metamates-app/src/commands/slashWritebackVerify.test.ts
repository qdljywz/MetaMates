import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveSlashWriteTargetPaths, verifySlashWriteback } from './slashWritebackVerify'

describe('resolveSlashWriteTargetPaths', () => {
  it('resolves today PLAN with date', () => {
    const paths = resolveSlashWriteTargetPaths('/today', 'zh', '2026-06-25')
    expect(paths).toEqual(['01_日记与计划/2026-06-25 PLAN.md'])
  })

  it('resolves sync Master_Control', () => {
    const paths = resolveSlashWriteTargetPaths('/sync', 'en', '2026-06-25')
    expect(paths[0]).toContain('Master_Control.md')
  })
})

describe('verifySlashWriteback', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      electronAPI: {
        path: { join: (...parts: string[]) => parts.join('/') },
        fileExists: vi.fn(async (p: string) => ({ exists: p.includes('PLAN.md') })),
        getFileStats: vi.fn(async () => ({
          success: true,
          stats: { size: 120, modified: Date.now() },
        })),
        listFiles: vi.fn(),
      },
    })
  })

  it('skips analysis-only commands', async () => {
    const result = await verifySlashWriteback({
      cmdId: '/context',
      workspacePath: 'E:/vault',
      language: 'zh',
      turnStartedAt: Date.now(),
    })
    expect(result.skipped).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('passes when required file exists and was updated', async () => {
    const result = await verifySlashWriteback({
      cmdId: '/today',
      workspacePath: 'E:/vault',
      language: 'zh',
      turnStartedAt: Date.now() - 1000,
    })
    expect(result.ok).toBe(true)
    expect(result.summaryKey).toBe('success')
  })
})
