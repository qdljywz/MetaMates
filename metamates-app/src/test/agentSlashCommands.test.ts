import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../commands/definitions'
import { getAgentSlashCommands } from '../commands/agentSlashCommands'
import { buildWorkspacePathHints } from '../commands/workspacePathHints'

const EXPECTED_IDS = [
  '/context',
  '/today',
  '/closeday',
  '/schedule',
  '/trace',
  '/connect',
  '/challenge',
  '/ghost',
  '/ideas',
  '/graduate',
  '/drift',
  '/emerge',
  '/sync',
  '/soal',
  '/intel',
] as const

const REQUIRES_INPUT = new Set(['/trace', '/connect', '/challenge', '/ghost', '/soal'])
const OPTIONAL_INPUT = new Set(['/today', '/closeday', '/schedule', '/sync', '/intel'])

describe('getAgentSlashCommands', () => {
  it('exposes all 15 slash commands including /intel', () => {
    const zh = getAgentSlashCommands('zh')
    const en = getAgentSlashCommands('en')
    expect(zh).toHaveLength(15)
    expect(en).toHaveLength(15)
    for (const id of EXPECTED_IDS) {
      expect(zh.some((c) => c.id === id)).toBe(true)
      expect(en.some((c) => c.id === id)).toBe(true)
    }
    expect(zh.some((c) => c.id === '/intel')).toBe(true)
    expect(zh.find((c) => c.id === '/intel')?.localHandler).toBe('intelligence')
  })

  it('maps chip name from command id (e.g. /today → today)', () => {
    const cmds = getAgentSlashCommands('zh')
    expect(cmds.find((c) => c.id === '/today')?.name).toBe('today')
    expect(cmds.find((c) => c.id === '/soal')?.name).toBe('soal')
  })

  it('marks input-required and optional-input commands correctly', () => {
    const cmds = getAgentSlashCommands('zh')
    for (const cmd of cmds) {
      if (REQUIRES_INPUT.has(cmd.id)) {
        expect(cmd.requiresInput).toBe(true)
        expect(cmd.inputMode).toBe('required')
        expect(cmd.inputPlaceholder).toBeTruthy()
        if (!cmd.localHandler) {
          expect(cmd.prompt).toContain('{INPUT}')
        }
      } else if (OPTIONAL_INPUT.has(cmd.id)) {
        expect(cmd.requiresInput).toBeFalsy()
        expect(cmd.inputMode).toBe('optional')
        expect(cmd.inputPlaceholder).toBeTruthy()
        if (!cmd.localHandler) {
          expect(cmd.prompt).toContain('{INPUT}')
        }
      } else {
        expect(cmd.requiresInput).toBeFalsy()
        expect(cmd.inputMode).toBe('none')
      }
    }
  })

  it('localizes /sync and /soal prompts by workspace language', () => {
    const zhSync = getAgentSlashCommands('zh').find((c) => c.id === '/sync')!
    const enSync = getAgentSlashCommands('en').find((c) => c.id === '/sync')!
    expect(zhSync.prompt).toContain('05_模板与配置')
    expect(enSync.prompt).toContain('05_Templates_and_Config')

    const zhSoal = getAgentSlashCommands('zh').find((c) => c.id === '/soal')!
    const enSoal = getAgentSlashCommands('en').find((c) => c.id === '/soal')!
    expect(zhSoal.prompt).toContain('用户 DNA')
    expect(enSoal.prompt).toContain('User DNA')
  })

  it('builds non-empty default prompts for direct-send commands', () => {
    for (const cmd of getAgentSlashCommands('zh')) {
      if (cmd.localHandler) continue
      expect(cmd.prompt.trim().length).toBeGreaterThan(20)
      expect(cmd.category).toMatch(/daily|thinking|inspiration|planning/)
    }
  })

  it('aligns with COMMANDS definitions', () => {
    const defIds = new Set(COMMANDS.map((c) => c.id))
    const agentIds = getAgentSlashCommands('zh').map((c) => c.id)
    for (const id of agentIds) {
      expect(defIds.has(id)).toBe(true)
    }
  })
})

describe('slash send payload helpers', () => {
  it('path hints include master control and second mind paths', () => {
    const zh = buildWorkspacePathHints('zh', 'E:/vault')
    expect(zh).toContain('05_模板与配置/Master_Control.md')
    expect(zh).toContain('2M.md')
    expect(zh).toContain('E:/vault')

    const en = buildWorkspacePathHints('en', 'E:/vault')
    expect(en).toContain('05_Templates_and_Config/Master_Control.md')
  })

  it('simulates direct command display text', () => {
    const cmd = getAgentSlashCommands('zh').find((c) => c.id === '/today')!
    const displayText = `/${cmd.name}`
    expect(displayText).toBe('/today')
  })

  it('simulates input command prompt substitution', () => {
    const cmd = getAgentSlashCommands('zh').find((c) => c.id === '/trace')!
    const userInput = 'MetaMates 产品定位'
    const finalPrompt = cmd.prompt.replace('{INPUT}', userInput)
    expect(finalPrompt).toContain('MetaMates 产品定位')
    expect(finalPrompt).not.toContain('{INPUT}')
  })

  it('supports optional guidance for daily writeback commands', () => {
    const cmd = getAgentSlashCommands('zh').find((c) => c.id === '/closeday')!
    const finalPrompt = cmd.prompt.replace('{INPUT}', '重点写下今天最大的分心点')
    expect(cmd.inputMode).toBe('optional')
    expect(finalPrompt).toContain('重点写下今天最大的分心点')
  })
})
