import { describe, it, expect } from 'vitest'
import {
  detectWorkspaceLanguageFromPaths,
  getRelativeVaultPath,
  getVaultNodeKey,
  hasDotPathSegment,
  isHiddenFromFileTree,
  filterMarkdownFilesForFileTree,
  isLivingControlFile,
  isSkillConfigPath,
  isStaticTemplateFile,
  isVaultContentFile,
} from './vaultPaths'

const WS = 'C:/MetaMatesVault/test-fixture'

describe('vaultPaths', () => {
  it('getRelativeVaultPath 应解析 Windows 绝对路径', () => {
    expect(getRelativeVaultPath(WS, `${WS}/01_日记与计划/2026-06-22.md`)).toBe(
      '01_日记与计划/2026-06-22.md',
    )
  })

  it('hasDotPathSegment 应识别 dot 目录', () => {
    expect(hasDotPathSegment('.codex/skills/foo/SKILL.md')).toBe(true)
    expect(hasDotPathSegment('01_日记与计划/a.md')).toBe(false)
  })

  it('isHiddenFromFileTree 应隐藏 CLI 配置目录与根 Agent 文件', () => {
    expect(isHiddenFromFileTree(WS, `${WS}/.claude`)).toBe(true)
    expect(isHiddenFromFileTree(WS, `${WS}/.codebuddy/skills/foo`)).toBe(true)
    expect(isHiddenFromFileTree(WS, `${WS}/.claude/skills/challenge.md`)).toBe(true)
    expect(isHiddenFromFileTree(WS, `${WS}/GEMINI.md`)).toBe(true)
    expect(isHiddenFromFileTree(WS, `${WS}/01_日记与计划/2026-06-22.md`)).toBe(false)
    expect(isHiddenFromFileTree(WS, `${WS}/05_模板与配置/Master_Control.md`)).toBe(false)
  })

  it('filterMarkdownFilesForFileTree 应与文件树可见范围一致', () => {
    const files = [
      { name: 'challenge.md', path: `${WS}/.claude/skills/challenge.md` },
      { name: 'context.md', path: `${WS}/.codex/skills/context.md` },
      { name: 'note.md', path: `${WS}/02_项目与知识/note.md` },
      { name: 'GEMINI.md', path: `${WS}/GEMINI.md` },
    ]
    const visible = filterMarkdownFilesForFileTree(WS, files)
    expect(visible.map((f) => f.name)).toEqual(['note.md'])
  })

  it('isSkillConfigPath 应识别 skills 与 SKILL.md', () => {
    expect(isSkillConfigPath('.codex/skills/metamates/SKILL.md')).toBe(true)
    expect(isSkillConfigPath('02_项目与知识/note.md')).toBe(false)
  })

  it('isLivingControlFile 应保留 Master_Control 与 2M', () => {
    expect(isLivingControlFile('05_模板与配置/Master_Control.md', 'zh')).toBe(true)
    expect(isLivingControlFile('05_模板与配置/2M.md', 'zh')).toBe(true)
    expect(isLivingControlFile('05_模板与配置/Daily_Note.md', 'zh')).toBe(false)
  })

  it('isStaticTemplateFile 应排除 05_ 静态模板', () => {
    expect(isStaticTemplateFile('05_模板与配置/GEMINI.md', 'zh')).toBe(true)
    expect(isStaticTemplateFile('05_模板与配置/Master_Control.md', 'zh')).toBe(false)
  })

  it('isVaultContentFile 应排除 dot/skills/静态模板', () => {
    expect(isVaultContentFile(WS, `${WS}/.codex/skills/x/SKILL.md`, 'zh')).toBe(false)
    expect(isVaultContentFile(WS, `${WS}/05_模板与配置/GEMINI.md`, 'zh')).toBe(false)
    expect(isVaultContentFile(WS, `${WS}/05_模板与配置/Master_Control.md`, 'zh')).toBe(true)
    expect(isVaultContentFile(WS, `${WS}/01_日记与计划/2026-06-22.md`, 'zh')).toBe(true)
    expect(isVaultContentFile(WS, `${WS}/README.md`, 'zh')).toBe(false)
  })

  it('isVaultContentFile 应排除根目录 Agent 配置', () => {
    expect(isVaultContentFile(WS, `${WS}/GEMINI.md`, 'zh')).toBe(false)
    expect(isVaultContentFile(WS, `${WS}/CLAUDE.md`, 'zh')).toBe(false)
    expect(isVaultContentFile(WS, `${WS}/CODEBUDDY.md`, 'zh')).toBe(false)
    expect(isVaultContentFile(WS, `${WS}/AI_Commands_Prompt.md`, 'zh')).toBe(false)
  })

  it('getVaultNodeKey 应使用路径级 ID', () => {
    expect(getVaultNodeKey(WS, `${WS}/02_项目与知识/智脉先锋/概览.md`)).toBe(
      '02_项目与知识/智脉先锋/概览',
    )
    expect(getVaultNodeKey(WS, `${WS}/.codex/skills/a/SKILL.md`)).toBe(
      '.codex/skills/a/SKILL',
    )
  })

  it('isVaultContentFile 应排除 sources 原件目录', () => {
    expect(isVaultContentFile(WS, `${WS}/04_情报与连接/sources/report.pdf`, 'zh')).toBe(false)
    expect(isVaultContentFile(WS, `${WS}/04_情报与连接/2026-06-22_报告.md`, 'zh')).toBe(true)
  })

  it('detectWorkspaceLanguageFromPaths 应从目录名推断语言', () => {
    expect(
      detectWorkspaceLanguageFromPaths(WS, [`${WS}/01_Log_and_Plan/Inbox/x.md`]),
    ).toBe('en')
    expect(
      detectWorkspaceLanguageFromPaths(WS, [`${WS}/01_日记与计划/Inbox/x.md`]),
    ).toBe('zh')
  })
})
