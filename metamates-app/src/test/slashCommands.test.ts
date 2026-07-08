import { describe, expect, it } from 'vitest'
import { normalizeSkillFilePaths, buildWorkspacePathHints } from '../commands/workspacePathHints'

describe('workspacePathHints', () => {
  it('fixes legacy zh skill directory names', () => {
    const raw = 'Read 05_模板与配置_Templates/2M.md and 01_日记与计划_Daily_Log/2026-01-01.md'
    const fixed = normalizeSkillFilePaths(raw, 'zh')
    expect(fixed).toContain('05_模板与配置/2M.md')
    expect(fixed).toContain('01_日记与计划/2026-01-01.md')
  })

  it('includes standard paths in hints', () => {
    const hints = buildWorkspacePathHints('zh', 'E:/vault')
    expect(hints).toContain('E:/vault')
    expect(hints).toContain('05_模板与配置/Master_Control.md')
    expect(hints).toContain('05_模板与配置/2M.md')
    expect(hints).toContain('YYYY-MM-DD PLAN.md')
  })
})

describe('getAgentSlashCommands', () => {
  it('exposes 15 slash commands including intel and soal', async () => {
    const { getAgentSlashCommands } = await import('../commands/agentSlashCommands')
    const commands = getAgentSlashCommands('zh')
    expect(commands).toHaveLength(15)
    expect(commands.find((cmd) => cmd.id === '/soal')?.requiresInput).toBe(true)
    expect(commands.find((cmd) => cmd.id === '/sync')?.prompt).toContain('05_模板与配置/Master_Control.md')
  })
})
