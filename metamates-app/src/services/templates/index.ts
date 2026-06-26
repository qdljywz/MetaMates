export interface Template {
  id: string
  name: string
  category: 'daily' | 'review' | 'project' | 'weekly'
  description: string
  content: string
}

export const TEMPLATES: Record<string, Template> = {
  dailyPlan: {
    id: 'dailyPlan',
    name: '每日计划',
    category: 'daily',
    description: '用于规划每日工作计划',
    content: `# 每日计划

**日期**：{{date}}

## 🌅 早晨任务（8:00-12:00）

- [ ] 
- [ ] 
- [ ] 

## ☀️ 上午任务（9:00-12:00）

- [ ] 
- [ ] 
- [ ] 

## 🌤️ 下午任务（14:00-18:00）

- [ ] 
- [ ] 
- [ ] 

## 🌙 晚上任务（19:00-22:00）

- [ ] 
- [ ] 
- [ ] 

## ⭐ 重要事项提醒

- 
- 
- 

## 📝 备注

`,
  },

  dailyReview: {
    id: 'dailyReview',
    name: '每日复盘',
    category: 'review',
    description: '用于每日工作复盘',
    content: `# 每日复盘

**日期**：{{date}}

## ✅ 完成的任务

- 
- 
- 

## ❌ 未完成的任务

- 
- 
- 

## 💡 今日收获和洞察

- 
- 
- 

## 🎯 明日预谋

- 
- 
- 

## 📊 自我评估

**精力状态**：⭐⭐⭐⭐⭐
**专注度**：⭐⭐⭐⭐⭐
**成就感**：⭐⭐⭐⭐⭐

`,
  },

  projectPlan: {
    id: 'projectPlan',
    name: '项目规划',
    category: 'project',
    description: '用于规划新项目',
    content: `# 项目规划

**项目名称**：{{projectName}}
**创建日期**：{{date}}

## 🎯 项目目标

- 
- 
- 

## 📋 任务分解

### 阶段一
- [ ] 
- [ ] 

### 阶段二
- [ ] 
- [ ] 

### 阶段三
- [ ] 
- [ ] 

## ⏰ 时间规划

- 预计开始时间：
- 预计完成时间：
- 关键里程碑：

## 🚧 风险评估

- 
- 

## 📚 参考资料

- 
- 

`,
  },

  weeklyReport: {
    id: 'weeklyReport',
    name: '周报',
    category: 'weekly',
    description: '用于生成周工作总结',
    content: `# 周报

**周期**：{{startDate}} - {{endDate}}

## 📈 本周进展

### 主要成果
- 
- 
- 

### 完成的任务
- 
- 
- 

## 🔍 问题与挑战

- 
- 

## 💡 经验总结

- 
- 

## 📅 下周计划

### 重点任务
- 
- 

### 预期目标
- 
- 

## 📊 数据统计

- 完成任务数：
- 进行中任务数：
- 待开始任务数：

`,
  },

  weeklyPlan: {
    id: 'weeklyPlan',
    name: '周计划',
    category: 'weekly',
    description: '用于规划本周工作计划',
    content: `# 周计划

**周次**：{{week}}

## 🎯 本周目标

- 
- 
- 

## 📅 每日安排

### 周一
- [ ] 
- [ ] 

### 周二
- [ ] 
- [ ] 

### 周三
- [ ] 
- [ ] 

### 周四
- [ ] 
- [ ] 

### 周五
- [ ] 
- [ ] 

## ⭐ 重要事项

- 
- 

## 📝 备注

`,
  },

  monthlyPlan: {
    id: 'monthlyPlan',
    name: '月度计划',
    category: 'weekly',
    description: '用于规划本月工作计划',
    content: `# 月度计划

**月份**：{{month}}

## 🎯 本月目标

- 
- 
- 

## 📅 周计划

### 第一周
- [ ] 
- [ ] 

### 第二周
- [ ] 
- [ ] 

### 第三周
- [ ] 
- [ ] 

### 第四周
- [ ] 
- [ ] 

## ⭐ 重要里程碑

- 
- 

## 📝 备注

`,
  },
}

export function getTemplate(templateId: string): Template | undefined {
  return TEMPLATES[templateId]
}

export function getTemplatesByCategory(category: Template['category']): Template[] {
  return Object.values(TEMPLATES).filter(t => t.category === category)
}

export function getAllTemplates(): Template[] {
  return Object.values(TEMPLATES)
}

export function applyTemplate(templateId: string, variables: Record<string, string>): string {
  const template = getTemplate(templateId)
  if (!template) {
    throw new Error(`Template not found: ${templateId}`)
  }

  let content = template.content
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g')
    content = content.replace(regex, value)
  })

  return content
}
