import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { assembleSlashPrompt } from '../commands/assembleSlashPrompt'
import { buildWritePolicyBlock, SLASH_WRITE_POLICIES } from '../commands/slashWritePolicy'
import { getAgentSlashCommands } from '../commands/agentSlashCommands'

const WORKSPACE = process.env.METAMATES_WORKSPACE?.trim()
  ? path.resolve(process.env.METAMATES_WORKSPACE)
  : path.join(process.cwd(), 'inits', 'zh')

function readCodebuddySkill(cmdName: string): string | null {
  const skillPath = path.join(WORKSPACE, '.codebuddy', 'skills', cmdName, 'SKILL.md')
  if (!fs.existsSync(skillPath)) return null
  return fs.readFileSync(skillPath, 'utf-8')
}

describe('business logic — slash prompt assembly (all 15)', () => {
  const commands = getAgentSlashCommands('zh')

  it('has exactly 15 commands', () => {
    expect(commands).toHaveLength(15)
  })

  for (const cmd of commands) {
    it(`${cmd.id} assembled prompt includes write policy and workspace context`, () => {
      const policy = SLASH_WRITE_POLICIES[cmd.id]
      expect(policy).toBeDefined()

      const skillContent = readCodebuddySkill(cmd.id.replace(/^\//, ''))
      const prompt = assembleSlashPrompt({
        cmd,
        language: 'zh',
        workspacePath: WORKSPACE,
        skillContent,
        userInput: policy.write !== 'never' ? '业务核实输入' : '',
      })

      expect(prompt.length).toBeGreaterThan(80)
      expect(prompt).toMatch(/写回策略|Write policy/)

      const block = buildWritePolicyBlock(cmd.id, 'zh')
      expect(prompt).toContain(block.slice(0, 20))

      if (policy.write === 'required') {
        expect(prompt).toMatch(/必须|MANDATORY/)
      }
      if (policy.write === 'never') {
        expect(prompt).toMatch(/记忆索引|Memory_Index/)
      }
    })
  }
})

describe('business logic — agent mode semantics', () => {
  it('default mode is yolo (auto-approve)', async () => {
    const { DEFAULT_AGENT_MODE, isAutoApproveMode } = await import('../utils/agentConnectionStatus')
    expect(DEFAULT_AGENT_MODE).toBe('yolo')
    expect(isAutoApproveMode('yolo')).toBe(true)
    expect(isAutoApproveMode('plan')).toBe(false)
  })
})
