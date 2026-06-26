export interface Template {
  id: string
  name: string
  description: string
  category: 'daily' | 'weekly' | 'monthly' | 'project' | 'review' | 'custom'
  content: string
  variables?: TemplateVariable[]
  fixedFileName?: string
}

export interface TemplateVariable {
  name: string
  type: 'text' | 'date' | 'number' | 'select'
  default?: string
  options?: string[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'daily-plan',
    name: '每日计划',
    description: '每日任务规划模板（单一文件，每日更新）',
    category: 'daily',
    fixedFileName: '每日计划.md',
    variables: [
      { name: 'date', type: 'date', default: 'today' },
      { name: 'focus', type: 'text', default: '' },
    ],
    content: `# 每日计划

> 最后更新：{{date}}

## 🎯 今日重点
{{focus}}

## ✅ 待办事项
- [ ] 
- [ ] 
- [ ] 

## 📅 时间块分配
| 时间 | 任务 | 状态 |
|------|------|------|
| 09:00-10:00 | | ⬜ |
| 10:00-12:00 | | ⬜ |
| 14:00-16:00 | | ⬜ |
| 16:00-18:00 | | ⬜ |

## 💡 备注
`,
  },
  {
    id: 'daily-review',
    name: '每日回顾',
    description: '每日总结回顾模板',
    category: 'daily',
    fixedFileName: '每日回顾.md',
    variables: [
      { name: 'date', type: 'date', default: 'today' },
    ],
    content: `# 每日回顾

> 最后更新：{{date}}

## ✅ 完成事项
- [x] 
- [x] 

## ❌ 未完成事项
- [ ] 
- [ ] 

## 💡 今日收获
1. 
2. 

## 🔄 明日计划
1. 
2. 

## 📊 精力评分
- 上午：⭐⭐⭐⭐⭐
- 下午：⭐⭐⭐⭐⭐
- 整体：⭐⭐⭐⭐⭐
`,
  },
  {
    id: 'weekly-plan',
    name: '周计划',
    description: '每周规划模板（单一文件，每周更新）',
    category: 'weekly',
    fixedFileName: '周计划.md',
    variables: [
      { name: 'week', type: 'text', default: '本周' },
    ],
    content: `# 周计划

> 最后更新：{{week}}

## 🎯 本周目标
1. 
2. 
3. 

## 📅 每日安排

### 周一
- 

### 周二
- 

### 周三
- 

### 周四
- 

### 周五
- 

### 周末
- 

## 📊 关键指标
| 指标 | 目标 | 实际 |
|------|------|------|
| | | |
| | | |

## 💡 本周重点
1. 
2. 
`,
  },
  {
    id: 'weekly-review',
    name: '周回顾',
    description: '每周总结回顾模板',
    category: 'weekly',
    fixedFileName: '周回顾.md',
    content: `# 周回顾

## 📊 本周概览
- 完成任务数：
- 重要里程碑：
- 整体进度：

## ✅ 完成事项
1. 
2. 
3. 

## ❌ 未完成事项
1. 
2. 

## 💡 经验教训
### 做得好的
- 

### 需要改进的
- 

## 🔄 下周计划
1. 
2. 
3. 

## 📈 成长记录
- 
`,
  },
  {
    id: 'monthly-plan',
    name: '月度计划',
    description: '月度规划模板（单一文件，每月更新）',
    category: 'monthly',
    fixedFileName: '月度计划.md',
    variables: [
      { name: 'month', type: 'text', default: '本月' },
    ],
    content: `# 月度计划

> 最后更新：{{month}}

## 🎯 月度目标
### 工作
1. 
2. 

### 学习
1. 
2. 

### 生活
1. 
2. 

## 📅 关键日期
| 日期 | 事项 |
|------|------|
| | |
| | |

## 📊 目标分解
| 目标 | 周次 | 关键结果 |
|------|------|----------|
| | | |
| | | |

## 💡 本月重点
1. 
2. 
`,
  },
  {
    id: 'monthly-review',
    name: '月度回顾',
    description: '月度总结回顾模板',
    category: 'monthly',
    fixedFileName: '月度回顾.md',
    content: `# 月度回顾

## 📊 月度概览
- 完成目标数：
- 重要成就：
- 整体评分：⭐⭐⭐⭐⭐

## ✅ 完成事项
### 工作
1. 
2. 

### 学习
1. 
2. 

### 生活
1. 
2. 

## 💡 经验总结
### 成功经验
1. 
2. 

### 改进方向
1. 
2. 

## 🔄 下月计划
1. 
2. 
3. 

## 📈 成长轨迹
- 
`,
  },
  {
    id: 'project-plan',
    name: '项目计划',
    description: '项目规划模板',
    category: 'project',
    variables: [
      { name: 'projectName', type: 'text', default: '' },
    ],
    content: `# 项目计划 - {{projectName}}

## 📋 项目概述
- **项目名称**：
- **开始日期**：
- **预计完成**：
- **负责人**：

## 🎯 项目目标
1. 
2. 
3. 

## 📊 项目范围
### 包含内容
- 
- 

### 不包含内容
- 
- 

## 📅 里程碑
| 里程碑 | 日期 | 状态 |
|--------|------|------|
| | | ⬜ |
| | | ⬜ |
| | | ⬜ |

## 👥 团队分工
| 成员 | 职责 |
|------|------|
| | |
| | |

## ⚠️ 风险评估
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| | | |
| | | |

## 💡 备注
`,
  },
  {
    id: 'project-review',
    name: '项目回顾',
    description: '项目总结回顾模板',
    category: 'project',
    content: `# 项目回顾

## 📊 项目概览
- **项目名称**：
- **实际周期**：
- **完成状态**：

## ✅ 完成情况
### 已完成
1. 
2. 

### 未完成
1. 
2. 

## 💡 经验总结
### 做得好的
1. 
2. 

### 需要改进的
1. 
2. 

## 📈 数据统计
- 实际耗时：
- 预算使用：
- 质量评分：

## 🔄 后续行动
1. 
2. 

## 📝 备注
`,
  },
  {
    id: 'goal-tracking',
    name: '目标追踪',
    description: '目标进度追踪模板',
    category: 'review',
    variables: [
      { name: 'goalName', type: 'text', default: '' },
    ],
    content: `# 目标追踪 - {{goalName}}

## 🎯 目标描述


## 📊 进度追踪
- **开始日期**：
- **目标日期**：
- **当前进度**：⬜⬜⬜⬜⬜ 0%

## ✅ 关键结果
| 关键结果 | 目标 | 当前 | 状态 |
|----------|------|------|------|
| | | | ⬜ |
| | | | ⬜ |
| | | | ⬜ |

## 📅 里程碑
- [ ] 
- [ ] 
- [ ] 

## ⚠️ 阻碍因素
1. 
2. 

## 💡 下一步行动
1. 
2. 

## 📝 备注
`,
  },
  {
    id: 'quick-note',
    name: '快速笔记',
    description: '快速记录模板',
    category: 'custom',
    variables: [
      { name: 'title', type: 'text', default: '' },
      { name: 'tags', type: 'text', default: '' },
    ],
    content: `# {{title}}

**日期**：{{date}}
**标签**：{{tags}}

## 内容


## 相关链接
- 

## 备注

`,
  },
]

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id)
}

export function getTemplatesByCategory(category: Template['category']): Template[] {
  return TEMPLATES.filter(t => t.category === category)
}

export function renderTemplate(template: Template, variables: Record<string, string> = {}): string {
  let content = template.content
  
  const defaultVars: Record<string, string> = {
    date: new Date().toLocaleDateString('zh-CN'),
  }
  
  const allVars = { ...defaultVars, ...variables }
  
  Object.entries(allVars).forEach(([key, value]) => {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value)
  })
  
  content = content.replace(/{{[^}]+}}/g, '')
  
  return content
}
