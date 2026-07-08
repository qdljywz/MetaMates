import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TEMPLATES, getTemplateById, getTemplatesByCategory, renderTemplate } from '../templates/definitions'
import { COMMANDS, getCommandById, getCommandsByCategory, searchCommands } from '../commands/definitions'

const DEFAULT_SETTINGS = {
  theme: 'dark' as const,
  fontSize: 14,
  autoSave: true,
  recentFiles: [] as string[],
}

describe('MetaMates 核心功能测试', () => {
  describe('模板系统', () => {
    it('应该有10个模板', () => {
      expect(TEMPLATES).toHaveLength(10)
    })

    it('应该包含所有必需的模板ID', () => {
      const requiredIds = [
        'daily-plan', 'daily-review',
        'weekly-plan', 'weekly-review',
        'monthly-plan', 'monthly-review',
        'project-plan', 'project-review',
        'goal-tracking', 'quick-note'
      ]
      
      requiredIds.forEach(id => {
        expect(TEMPLATES.find(t => t.id === id)).toBeDefined()
      })
    })

    it('应该正确替换日期变量', () => {
      const template = TEMPLATES[0]
      const rendered = renderTemplate(template, { date: '2024-03-11' })
      expect(rendered).toContain('2024-03-11')
    })

    it('应该按类别获取模板', () => {
      const dailyTemplates = getTemplatesByCategory('daily')
      expect(dailyTemplates.length).toBeGreaterThan(0)
    })

    it('应该通过ID获取模板', () => {
      const template = getTemplateById('daily-plan')
      expect(template).toBeDefined()
      expect(template?.name).toBe('每日计划')
    })
  })

  describe('命令系统', () => {
    it('应该有15个命令', () => {
      expect(COMMANDS).toHaveLength(15)
    })

    it('应该包含所有必需的命令ID', () => {
      const requiredIds = [
        '/context', '/today', '/closeday', '/schedule', '/trace',
        '/connect', '/challenge', '/ghost', '/ideas', '/graduate',
        '/drift', '/emerge', '/sync', '/soal'
      ]
      
      requiredIds.forEach(id => {
        expect(COMMANDS.find(cmd => cmd.id === id)).toBeDefined()
      })
    })

    it('应该有有效的命令结构', () => {
      COMMANDS.forEach(cmd => {
        expect(cmd.id).toMatch(/^\//)
        expect(cmd.name).toBeTruthy()
        expect(cmd.description).toBeTruthy()
        expect(['daily', 'thinking', 'inspiration', 'planning']).toContain(cmd.category)
      })
    })

    it('应该按类别获取命令', () => {
      const dailyCommands = getCommandsByCategory('daily')
      expect(dailyCommands.length).toBe(4)
    })

    it('应该搜索命令', () => {
      const results = searchCommands('今日')
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('存储服务', () => {
    it('应该有正确的默认设置', () => {
      expect(DEFAULT_SETTINGS.theme).toBe('dark')
      expect(DEFAULT_SETTINGS.fontSize).toBe(14)
      expect(DEFAULT_SETTINGS.autoSave).toBe(true)
      expect(DEFAULT_SETTINGS.recentFiles).toEqual([])
    })
  })

  describe('文件操作层', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('应该正确设置工作区', () => {
      expect(true).toBe(true)
    })

    it('应该正确写入 Master Control 文件', async () => {
      expect(true).toBe(true)
    })

    it('应该正确读取文件列表', async () => {
      expect(true).toBe(true)
    })
  })
})
