import { describe, expect, it } from 'vitest'
import path from 'path'
import {
  getWorkspaceSkillRelativePath,
  resolveSkillPaths,
} from '../../electron/shared/skillLayouts'
import { COMMAND_SKILL_NAMES } from '../../electron/shared/skillCatalog'

describe('resolveSkillPaths', () => {
  const root = 'E:/vault'

  it('resolves gemini skill path first for gemini backend', () => {
    const paths = resolveSkillPaths(root, 'today', 'gemini')
    expect(paths[0]).toBe(path.join(root, '.gemini', 'skills', 'today', 'SKILL.md'))
  })

  it('resolves qwen native folder before claude fallback', () => {
    const paths = resolveSkillPaths(root, 'today', 'qwen')
    expect(paths[0]).toBe(path.join(root, '.qwen', 'skills', 'today', 'SKILL.md'))
    expect(paths).toContain(path.join(root, '.claude', 'skills', 'today.md'))
  })

  it('resolves codex native folder and .agents fallback', () => {
    const paths = resolveSkillPaths(root, 'sync', 'codex')
    expect(paths[0]).toBe(path.join(root, '.codex', 'skills', 'sync', 'SKILL.md'))
    expect(paths).toContain(path.join(root, '.agents', 'skills', 'sync', 'SKILL.md'))
  })

  it('keeps claude flat layout', () => {
    expect(getWorkspaceSkillRelativePath('claude', 'today')).toBe(
      path.join('.claude', 'skills', 'today.md'),
    )
  })

  it('covers all 15 command skill names', () => {
    expect(COMMAND_SKILL_NAMES).toHaveLength(15)
    expect(COMMAND_SKILL_NAMES).toContain('intel')
    expect(COMMAND_SKILL_NAMES).toContain('soal')
  })
})
