import { describe, expect, it } from 'vitest'
import { isPathInsideWorkspace, toWorkspaceRelativePath } from '../../electron/shared/pathSafetyCore'

describe('pathSafety vault boundary', () => {
  const workspace = 'E:\\MyM2'

  it('accepts paths inside workspace', () => {
    expect(isPathInsideWorkspace(workspace, 'E:\\MyM2\\01_日记与计划\\2026-06-23 PLAN.md')).toBe(true)
    expect(toWorkspaceRelativePath(workspace, '01_日记与计划/2026-06-23 PLAN.md')).toBe(
      '01_日记与计划/2026-06-23 PLAN.md',
    )
  })

  it('rejects CodeBuddy memory path outside vault', () => {
    const outside = 'C:/Users/Administrator/.codebuddy/projects/e-MyM2/memory/MEMORY.md'
    expect(isPathInsideWorkspace(workspace, outside)).toBe(false)
    expect(toWorkspaceRelativePath(workspace, outside)).toBeNull()
  })
})
