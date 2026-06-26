export interface FileTemplate {
  id: string
  name: string
  description: string
  category: 'note' | 'daily' | 'meeting' | 'project' | 'task' | 'custom'
  content: string
  variables?: TemplateVariable[]
}

export interface TemplateVariable {
  name: string
  type: 'text' | 'date' | 'time' | 'select'
  default?: string
  options?: string[]
}

const formatDate = (date: Date = new Date()): string => {
  return date.toISOString().split('T')[0]
}

const formatTime = (date: Date = new Date()): string => {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const formatWeekday = (date: Date = new Date()): string => {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekdays[date.getDay()]
}

export const defaultTemplates: FileTemplate[] = [
  {
    id: 'empty',
    name: '空白笔记',
    description: '一个简单的空白笔记模板',
    category: 'note',
    content: `# {{title}}

创建时间：{{date}}

## 内容

`,
    variables: [
      { name: 'title', type: 'text', default: '新笔记' },
      { name: 'date', type: 'date' },
    ],
  },
  {
    id: 'daily',
    name: '每日笔记',
    description: '每日记录模板',
    category: 'daily',
    content: `# {{date}} {{weekday}}

## 今日目标

- [ ] 
- [ ] 
- [ ] 

## 日程安排

| 时间 | 事项 |
|------|------|
| 09:00 |  |
| 10:00 |  |
| 14:00 |  |
| 16:00 |  |

## 笔记

### 工作


### 学习


### 生活


## 今日总结

### 完成事项


### 明日计划

- [ ] 
- [ ] 

## 相关链接

- [[]]

#日记 #{{date}}
`,
    variables: [
      { name: 'date', type: 'date' },
      { name: 'weekday', type: 'text' },
    ],
  },
  {
    id: 'meeting',
    name: '会议记录',
    description: '会议记录模板',
    category: 'meeting',
    content: `# {{title}}

**日期**：{{date}}
**时间**：{{time}}
**参与者**：
**地点**：

## 会议议题

1. 
2. 
3. 

## 讨论内容

### 议题一


### 议题二


### 议题三


## 决议事项

| 序号 | 决议内容 | 负责人 | 截止日期 |
|------|----------|--------|----------|
| 1 |  |  |  |
| 2 |  |  |  |

## 待办事项

- [ ] 
- [ ] 

## 下次会议

**日期**：
**议题**：

## 相关资料

- [[]]

#会议 #{{date}}
`,
    variables: [
      { name: 'title', type: 'text', default: '会议记录' },
      { name: 'date', type: 'date' },
      { name: 'time', type: 'time' },
    ],
  },
  {
    id: 'project',
    name: '项目计划',
    description: '项目计划模板',
    category: 'project',
    content: `# {{title}}

## 项目概述

**项目名称**：
**负责人**：
**开始日期**：{{date}}
**预计完成**：
**状态**：进行中

## 项目目标

1. 
2. 
3. 

## 里程碑

| 里程碑 | 预计日期 | 实际日期 | 状态 |
|--------|----------|----------|------|
| M1 |  |  | 待开始 |
| M2 |  |  | 待开始 |
| M3 |  |  | 待开始 |

## 任务分解

### 阶段一

- [ ] 任务1
- [ ] 任务2
- [ ] 任务3

### 阶段二

- [ ] 任务1
- [ ] 任务2

### 阶段三

- [ ] 任务1
- [ ] 任务2

## 资源需求

### 人员


### 工具


### 预算


## 风险评估

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
|  | 高/中/低 | 高/中/低 |  |

## 相关文档

- [[]]

## 更新日志

- {{date}}：项目启动

#项目 #{{title}}
`,
    variables: [
      { name: 'title', type: 'text', default: '项目计划' },
      { name: 'date', type: 'date' },
    ],
  },
  {
    id: 'task',
    name: '任务清单',
    description: '任务清单模板',
    category: 'task',
    content: `# {{title}}

创建时间：{{date}}

## 高优先级 🔴

- [ ] 
- [ ] 

## 中优先级 🟡

- [ ] 
- [ ] 

## 低优先级 🟢

- [ ] 
- [ ] 

## 进行中

- [ ] 
- [ ] 

## 已完成 ✅

- [x] 

## 备注


#任务 #{{date}}
`,
    variables: [
      { name: 'title', type: 'text', default: '任务清单' },
      { name: 'date', type: 'date' },
    ],
  },
  {
    id: 'reading',
    name: '读书笔记',
    description: '读书笔记模板',
    category: 'note',
    content: `# {{title}}

**作者**：
**阅读日期**：{{date}}
**评分**：⭐⭐⭐⭐⭐

## 基本信息

- **出版社**：
- **出版年份**：
- **页数**：

## 内容概要


## 章节笔记

### 第一章


### 第二章


### 第三章


## 精彩摘录

> 

## 核心观点

1. 
2. 
3. 

## 个人感悟


## 行动计划

- [ ] 
- [ ] 

## 相关链接

- [[]]

#读书 #笔记
`,
    variables: [
      { name: 'title', type: 'text', default: '读书笔记' },
      { name: 'date', type: 'date' },
    ],
  },
  {
    id: 'weekly',
    name: '周报',
    description: '周报模板',
    category: 'daily',
    content: `# 周报 {{date}}

## 本周工作总结

### 已完成任务

1. 
2. 
3. 

### 进行中任务

1. 
2. 

### 遇到的问题

1. 
2. 

## 下周工作计划

### 重点任务

| 任务 | 优先级 | 预计完成时间 |
|------|--------|--------------|
|  | 高 |  |
|  | 中 |  |

### 需要的支持


## 数据指标

| 指标 | 本周 | 上周 | 变化 |
|------|------|------|------|
|  |  |  |  |

## 学习与成长

### 本周学习


### 下周计划学习


## 其他

#周报 #{{date}}
`,
    variables: [
      { name: 'date', type: 'date' },
    ],
  },
]

class TemplateService {
  private templates: Map<string, FileTemplate> = new Map()
  private customTemplates: Map<string, FileTemplate> = new Map()

  constructor() {
    defaultTemplates.forEach(t => this.templates.set(t.id, t))
    this.loadCustomTemplates()
  }

  private loadCustomTemplates(): void {
    try {
      const stored = localStorage.getItem('metamates_custom_templates')
      if (stored) {
        const templates = JSON.parse(stored) as FileTemplate[]
        templates.forEach(t => this.customTemplates.set(t.id, t))
      }
    } catch (error) {
      console.error('Failed to load custom templates:', error)
    }
  }

  private saveCustomTemplates(): void {
    try {
      const templates = Array.from(this.customTemplates.values())
      localStorage.setItem('metamates_custom_templates', JSON.stringify(templates))
    } catch (error) {
      console.error('Failed to save custom templates:', error)
    }
  }

  getTemplate(id: string): FileTemplate | undefined {
    return this.templates.get(id) || this.customTemplates.get(id)
  }

  getAllTemplates(): FileTemplate[] {
    return [...Array.from(this.templates.values()), ...Array.from(this.customTemplates.values())]
  }

  getTemplatesByCategory(category: string): FileTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category)
  }

  addCustomTemplate(template: FileTemplate): void {
    const customTemplate = {
      ...template,
      id: `custom_${Date.now()}`,
      category: 'custom' as const,
    }
    this.customTemplates.set(customTemplate.id, customTemplate)
    this.saveCustomTemplates()
  }

  removeCustomTemplate(id: string): boolean {
    if (this.customTemplates.has(id)) {
      this.customTemplates.delete(id)
      this.saveCustomTemplates()
      return true
    }
    return false
  }

  renderTemplate(templateId: string, variables: Record<string, string> = {}): string {
    const template = this.getTemplate(templateId)
    if (!template) {
      return ''
    }

    let content = template.content
    const now = new Date()

    const defaultValues: Record<string, string> = {
      date: formatDate(now),
      time: formatTime(now),
      weekday: formatWeekday(now),
    }

    const allVariables = { ...defaultValues, ...variables }

    template.variables?.forEach(v => {
      const value = allVariables[v.name] || v.default || ''
      const placeholder = new RegExp(`{{${v.name}}}`, 'g')
      content = content.replace(placeholder, value)
    })

    content = content.replace(/{{(\w+)}}/g, (_, name) => {
      return allVariables[name] || ''
    })

    return content
  }

  createDailyNote(): { name: string; content: string } {
    const now = new Date()
    const dateStr = formatDate(now)
    const name = `${dateStr}.md`
    const content = this.renderTemplate('daily', {
      date: dateStr,
      weekday: formatWeekday(now),
    })
    return { name, content }
  }

  createFromTemplate(templateId: string, title?: string): { name: string; content: string } | null {
    const template = this.getTemplate(templateId)
    if (!template) return null

    const now = new Date()
    const name = title ? `${title}.md` : `${template.name}_${formatDate(now)}.md`
    const content = this.renderTemplate(templateId, { title: title || template.name })
    
    return { name, content }
  }
}

export const templateService = new TemplateService()
