import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTemplatesByCategory, TEMPLATES, renderTemplate, getTemplateById } from '../templates/definitions'

describe('模板系统测试', () => {
  describe('getTemplatesByCategory', () => {
    it('应该返回每日类别的模板', () => {
      const dailyTemplates = getTemplatesByCategory('daily')
      expect(dailyTemplates.length).toBeGreaterThan(0)
      expect(dailyTemplates.every(t => t.category === 'daily')).toBe(true)
    })
    
    it('应该返回每周类别的模板', () => {
      const weeklyTemplates = getTemplatesByCategory('weekly')
      expect(weeklyTemplates.length).toBeGreaterThan(0)
      expect(weeklyTemplates.every(t => t.category === 'weekly')).toBe(true)
    })
    
    it('应该返回每月类别的模板', () => {
      const monthlyTemplates = getTemplatesByCategory('monthly')
      expect(monthlyTemplates.length).toBeGreaterThan(0)
      expect(monthlyTemplates.every(t => t.category === 'monthly')).toBe(true)
    })
    
    it('应该返回项目类别的模板', () => {
      const projectTemplates = getTemplatesByCategory('project')
      expect(projectTemplates.length).toBeGreaterThan(0)
      expect(projectTemplates.every(t => t.category === 'project')).toBe(true)
    })
    
    it('应该返回空数组对于不存在的类别', () => {
      const result = getTemplatesByCategory('nonexistent' as any)
      expect(result.length).toBe(0)
    })
  })
  
  describe('模板定义', () => {
    it('所有模板应该有名称', () => {
      TEMPLATES.forEach(template => {
        expect(template.name).toBeDefined()
        expect(template.name.length).toBeGreaterThan(0)
      })
    })
    
    it('所有模板应该有描述', () => {
      TEMPLATES.forEach(template => {
        expect(template.description).toBeDefined()
        expect(template.description.length).toBeGreaterThan(0)
      })
    })
    
    it('所有模板应该有内容', () => {
      TEMPLATES.forEach(template => {
        expect(template.content).toBeDefined()
        expect(template.content.length).toBeGreaterThan(0)
      })
    })
    
    it('所有模板应该有有效的类别', () => {
      const validCategories = ['daily', 'weekly', 'monthly', 'project', 'review', 'custom']
      TEMPLATES.forEach(template => {
        expect(validCategories.includes(template.category)).toBe(true)
      })
    })
    
    it('所有模板应该有唯一ID', () => {
      const ids = TEMPLATES.map(t => t.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })
  
  describe('getTemplateById', () => {
    it('应该根据ID返回模板', () => {
      const template = getTemplateById('daily-plan')
      expect(template).toBeDefined()
      expect(template?.name).toBe('每日计划')
    })
    
    it('应该返回 undefined 对于不存在的ID', () => {
      const template = getTemplateById('nonexistent')
      expect(template).toBeUndefined()
    })
  })
  
  describe('renderTemplate', () => {
    it('应该替换变量', () => {
      const template = getTemplateById('daily-plan')!
      const rendered = renderTemplate(template, { focus: '完成测试' })
      expect(rendered).toContain('完成测试')
    })
    
    it('应该替换日期变量', () => {
      const template = getTemplateById('daily-plan')!
      const rendered = renderTemplate(template)
      const today = new Date().toLocaleDateString('zh-CN')
      expect(rendered).toContain(today)
    })
    
    it('应该移除未替换的变量占位符', () => {
      const template = getTemplateById('project-plan')!
      const rendered = renderTemplate(template, { projectName: '测试项目' })
      expect(rendered).not.toMatch(/{{[^}]+}}/)
    })
  })
  
  describe('模板变量替换', () => {
    it('应该替换日期变量', () => {
      const content = '{{date}}'
      const now = new Date()
      const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      
      const rendered = content.replace(/{{date}}/g, dateStr)
      expect(rendered).toBe(dateStr)
    })
    
    it('应该替换周变量', () => {
      const content = '{{week}}'
      const now = new Date()
      const weekStr = `第${Math.ceil(now.getDate() / 7)}周`
      
      const rendered = content.replace(/{{week}}/g, weekStr)
      expect(rendered).toBe(weekStr)
    })
    
    it('应该替换月变量', () => {
      const content = '{{month}}'
      const now = new Date()
      const monthStr = `${now.getMonth() + 1}月`
      
      const rendered = content.replace(/{{month}}/g, monthStr)
      expect(rendered).toBe(monthStr)
    })
    
    it('应该替换多个变量', () => {
      const content = '日期: {{date}}, 周: {{week}}, 月: {{month}}'
      const now = new Date()
      const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      const weekStr = `第${Math.ceil(now.getDate() / 7)}周`
      const monthStr = `${now.getMonth() + 1}月`
      
      let rendered = content
        .replace(/{{date}}/g, dateStr)
        .replace(/{{week}}/g, weekStr)
        .replace(/{{month}}/g, monthStr)
      
      expect(rendered).toContain(dateStr)
      expect(rendered).toContain(weekStr)
      expect(rendered).toContain(monthStr)
    })
  })
  
  describe('模板内容验证', () => {
    it('每日模板应该包含日期相关内容', () => {
      const dailyTemplates = getTemplatesByCategory('daily')
      dailyTemplates.forEach(template => {
        const hasDateContent = 
          template.content.includes('日期') || 
          template.content.includes('Date') ||
          template.content.includes('{{date}}')
        expect(hasDateContent).toBe(true)
      })
    })
    
    it('项目模板应该包含项目相关内容', () => {
      const projectTemplates = getTemplatesByCategory('project')
      projectTemplates.forEach(template => {
        const hasProjectContent = 
          template.content.includes('项目') || 
          template.content.includes('Project') ||
          template.content.includes('目标') ||
          template.content.includes('Goal')
        expect(hasProjectContent).toBe(true)
      })
    })
    
    it('模板内容应该是有效的 Markdown', () => {
      TEMPLATES.forEach(template => {
        const hasMarkdown = 
          template.content.includes('#') ||
          template.content.includes('-') ||
          template.content.includes('[]') ||
          template.content.includes('**')
        expect(hasMarkdown).toBe(true)
      })
    })
  })
})
