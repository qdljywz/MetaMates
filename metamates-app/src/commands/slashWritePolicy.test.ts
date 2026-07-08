import { describe, expect, it } from 'vitest'
import { assembleSlashPrompt } from './assembleSlashPrompt'
import { buildWritePolicyBlock, SLASH_WRITE_POLICIES, slashCommandNeedsWriteTool } from './slashWritePolicy'
import { getAgentSlashCommands } from './agentSlashCommands'

describe('slashWritePolicy', () => {
  it('defines policies for all slash commands', () => {
    const ids = getAgentSlashCommands('zh').map((c) => c.id)
    expect(ids).toHaveLength(15)
    for (const id of ids) {
      expect(SLASH_WRITE_POLICIES[id]).toBeDefined()
    }
  })

  it('requires writeback for today, sync, and soal', () => {
    expect(SLASH_WRITE_POLICIES['/today'].write).toBe('required')
    expect(SLASH_WRITE_POLICIES['/sync'].write).toBe('required')
    expect(SLASH_WRITE_POLICIES['/soal'].write).toBe('required')
  })

  it('buildWritePolicyBlock mentions target paths for required commands', () => {
    const block = buildWritePolicyBlock('/today', 'zh')
    expect(block).toContain('PLAN')
    expect(block).toContain('必须')
  })

  it('analysis-only commands mention memory index mirror', () => {
    const block = buildWritePolicyBlock('/context', 'zh')
    expect(block).toContain('记忆索引')
  })
})

describe('assembleSlashPrompt', () => {
  it('includes path hints, write policy, and skill body', () => {
    const cmd = getAgentSlashCommands('zh').find((c) => c.id === '/sync')!
    const prompt = assembleSlashPrompt({
      cmd,
      language: 'zh',
      workspacePath: 'E:/vault',
      skillContent: '# Sync skill\nUpdate Master_Control.',
      userInput: 'focus on project A',
    })
    expect(prompt).toContain('E:/vault')
    expect(prompt).toContain('Master_Control.md')
    expect(prompt).toContain('写回策略')
    expect(prompt).toContain('Sync skill')
    expect(prompt).toContain('focus on project A')
  })

  it('falls back to agent prompt when skill missing', () => {
    const cmd = getAgentSlashCommands('en').find((c) => c.id === '/trace')!
    const prompt = assembleSlashPrompt({
      cmd,
      language: 'en',
      userInput: 'MetaMates positioning',
    })
    expect(prompt).toContain('MetaMates positioning')
    expect(prompt).toContain('analysis-only')
  })

  it('injects explicit timezone into slash prompt', () => {
    const cmd = getAgentSlashCommands('zh').find((c) => c.id === '/today')!
    const prompt = assembleSlashPrompt({
      cmd,
      language: 'zh',
      timezone: 'America/Los_Angeles',
    })
    expect(prompt).toContain('America/Los_Angeles')
    expect(prompt).toContain('生效时区')
    expect(prompt).toContain('YYYY-MM-DD PLAN.md')
  })
})
