import {
  PATHS,
  getDailyPlanPath,
  getTodayDateString,
  resolveDailyPlanDir,
  resolveDailyPlanPath,
} from '../../constants/paths'

export interface Task {
  id: string
  content: string
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
  dueDate?: string
  completedAt?: string
  source: string
}

export interface Project {
  name: string
  path: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  readme?: string
  lastModified: number
  tasks: Task[]
}

export interface MasterControl {
  date: string
  path: string
  content: string
  tasks: Task[]
  priorities: string[]
  timeBlocks: TimeBlock[]
  reflections: string[]
}

export interface TimeBlock {
  start: string
  end: string
  task: string
  type: 'deep_work' | 'shallow_work' | 'meeting' | 'break'
  completed: boolean
}

export interface DailyReview {
  date: string
  path: string
  achievements: string[]
  newIdeas: string[]
  unfinishedTasks: Task[]
  tomorrowPlan: string[]
  timeAnalysis: {
    deepWork: number
    shallowWork: number
    meetings: number
    wasted: number
  }
}

class FileOperationLayer {
  private workspacePath: string = ''

  setWorkspace(path: string): void {
    this.workspacePath = path
  }

  async readMasterControl(date?: Date): Promise<MasterControl | null> {
    if (!window.electronAPI) return null

    const targetDate = date || new Date()
    const dateStr = targetDate.toISOString().split('T')[0]
    const mcPath = getDailyPlanPath(this.workspacePath, dateStr)

    const result = await window.electronAPI.readFile(mcPath)
    if (!result.success || !result.content) return null

    return this.parseMasterControl(result.content, mcPath, dateStr)
  }

  async writeMasterControl(mc: MasterControl): Promise<boolean> {
    if (!window.electronAPI) return false

    const content = mc.content || this.generateMasterControlContent(mc)
    const dirPath = await resolveDailyPlanDir(this.workspacePath)
    const dirFullPath = `${this.workspacePath}/${dirPath}`
    
    const dirResult = await window.electronAPI.createDirectory(dirFullPath)
    if (!dirResult.success) {
      console.error('创建目录失败:', dirResult.error)
      return false
    }
    
    const result = await window.electronAPI.writeFile(mc.path, content)
    
    if (!result.success) {
      console.error('写入文件失败:', result.error)
      return false
    }
    
    const verifyResult = await window.electronAPI.readFile(mc.path)
    if (!verifyResult.success || !verifyResult.content) {
      console.error('验证文件失败:', verifyResult.error)
      return false
    }
    
    console.log('文件写入成功:', mc.path)
    console.log('写入内容长度:', content.length)
    console.log('验证内容长度:', verifyResult.content.length)
    return true
  }

  async readYesterdayReview(): Promise<DailyReview | null> {
    if (!window.electronAPI) return null

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    
    const reviewPath = `${this.workspacePath}/每日复盘/${dateStr} 每日复盘.md`
    const result = await window.electronAPI.readFile(reviewPath)
    
    if (!result.success || !result.content) return null

    return this.parseDailyReview(result.content, reviewPath, dateStr)
  }

  async readAllTasks(): Promise<Task[]> {
    if (!window.electronAPI) return []

    const tasks: Task[] = []
    const result = await window.electronAPI.listFiles(this.workspacePath)
    
    if (!result.success || !result.files) return tasks

    for (const file of result.files) {
      if (!file.name.endsWith('.md')) continue
      
      const readResult = await window.electronAPI.readFile(file.path)
      if (readResult.success && readResult.content) {
        const fileTasks = this.extractTasks(readResult.content, file.path)
        tasks.push(...fileTasks)
      }
    }

    return tasks
  }

  async findProjects(): Promise<Project[]> {
    if (!window.electronAPI) return []

    const projects: Project[] = []
    const result = await window.electronAPI.listFiles(this.workspacePath)
    
    if (!result.success || !result.files) return projects

    const directories = result.files.filter((f: any) => f.isDirectory)
    
    for (const dir of directories) {
      const readmeResult = await window.electronAPI.readFile(`${dir.path}/README.md`)
      
      const project: Project = {
        name: dir.name,
        path: dir.path,
        status: 'active',
        readme: readmeResult.success ? readmeResult.content : undefined,
        lastModified: Date.now(),
        tasks: []
      }

      if (readmeResult.success && readmeResult.content) {
        const statusMatch = readmeResult.content.match(/状态[：:]\s*(.+)/i)
        if (statusMatch) {
          project.status = this.parseProjectStatus(statusMatch[1].trim())
        }
      }

      const taskResult = await window.electronAPI.listFiles(dir.path)
      if (taskResult.success && taskResult.files) {
        for (const file of taskResult.files) {
          if (file.name.endsWith('.md')) {
            const fileResult = await window.electronAPI.readFile(file.path)
            if (fileResult.success && fileResult.content) {
              project.tasks.push(...this.extractTasks(fileResult.content, file.path))
            }
          }
        }
      }

      projects.push(project)
    }

    return projects
  }

  async createDailyPlan(content: string): Promise<string | null> {
    if (!window.electronAPI) return null

    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]
    const dirPath = `${this.workspacePath}/每日计划`
    const filePath = `${dirPath}/${dateStr} 每日计划.md`

    await window.electronAPI.createDirectory(dirPath)
    const result = await window.electronAPI.writeFile(filePath, content)
    
    return result.success ? filePath : null
  }

  async createDailyReview(content: string): Promise<string | null> {
    if (!window.electronAPI) return null

    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]
    const dirPath = `${this.workspacePath}/每日复盘`
    const filePath = `${dirPath}/${dateStr} 每日复盘.md`

    await window.electronAPI.createDirectory(dirPath)
    const result = await window.electronAPI.writeFile(filePath, content)
    
    return result.success ? filePath : null
  }

  private parseMasterControl(content: string, path: string, dateStr: string): MasterControl {
    const tasks = this.extractTasks(content, path)
    const priorities = this.extractPriorities(content)
    const timeBlocks = this.extractTimeBlocks(content)
    const reflections = this.extractReflections(content)

    return {
      date: dateStr,
      path,
      content,
      tasks,
      priorities,
      timeBlocks,
      reflections
    }
  }

  private parseDailyReview(content: string, path: string, dateStr: string): DailyReview {
    const achievements = this.extractSection(content, '今日成就', '新想法')
    const newIdeas = this.extractSection(content, '新想法', '未完成任务')
    const tomorrowPlan = this.extractSection(content, '明日预谋', '生成时间')

    return {
      date: dateStr,
      path,
      achievements,
      newIdeas,
      unfinishedTasks: this.extractTasks(content, path).filter(t => t.status !== 'done'),
      tomorrowPlan,
      timeAnalysis: { deepWork: 0, shallowWork: 0, meetings: 0, wasted: 0 }
    }
  }

  private extractTasks(content: string, source: string): Task[] {
    const tasks: Task[] = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      const todoMatch = line.match(/^[-*] \[([ x])\]\s*(.+)/i)
        if (todoMatch) {
          const task: Task = {
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content: todoMatch[2].trim(),
            status: todoMatch[1] === 'x' ? 'done' : 'todo',
            priority: 'medium',
            source
          }
          
          if (line.includes('🔥') || line.includes('重要')) {
            task.priority = 'high'
          }
          
          tasks.push(task)
        }
      }
    
    return tasks
  }

  private extractPriorities(content: string): string[] {
    const priorities: string[] = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      if (line.match(/^#+\s*(今日重点|优先事项|重要)/i)) {
        const nextLines = lines.slice(lines.indexOf(line) + 1)
        for (const nextLine of nextLines) {
          if (nextLine.match(/^[-*]\s/)) {
            priorities.push(nextLine.replace(/^[-*]\s*/, '').trim())
          } else if (nextLine.match(/^#/)) {
            break
          }
        }
      }
    }
    
    return priorities
  }

  private extractTimeBlocks(content: string): TimeBlock[] {
    const blocks: TimeBlock[] = []
    const timeMatch = content.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*[:：]\s*(.+)/g)
    
    if (timeMatch) {
      for (const match of timeMatch) {
        const parts = match.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*[:：]\s*(.+)/)
        if (parts) {
          blocks.push({
            start: parts[1],
            end: parts[2],
            task: parts[3].trim(),
            type: this.detectTaskType(parts[3]),
            completed: false
          })
        }
      }
    }
    
    return blocks
  }

  private detectTaskType(task: string): TimeBlock['type'] {
    const lowerTask = task.toLowerCase()
    if (lowerTask.includes('会议') || lowerTask.includes('沟通') || lowerTask.includes('call')) {
      return 'meeting'
    }
    if (lowerTask.includes('休息') || lowerTask.includes('午餐') || lowerTask.includes('break')) {
      return 'break'
    }
    if (lowerTask.includes('深度') || lowerTask.includes('思考') || lowerTask.includes('写作') || lowerTask.includes('代码')) {
      return 'deep_work'
    }
    return 'shallow_work'
  }

  private extractReflections(content: string): string[] {
    const reflections: string[] = []
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.match(/^#+\s*(反思|洞察|复盘)/i)) {
        const nextLines = lines.slice(i + 1)
        for (const nextLine of nextLines) {
          if (nextLine.trim() && !nextLine.match(/^#/)) {
            reflections.push(nextLine.trim())
          } else if (nextLine.match(/^#/)) {
            break
          }
        }
      }
    }
    
    return reflections
  }

  private extractSection(content: string, startKeyword: string, endKeyword: string): string[] {
    const items: string[] = []
    const lines = content.split('\n')
    let inSection = false
    
    for (const line of lines) {
      if (line.includes(startKeyword)) {
        inSection = true
        continue
      }
      if (inSection && line.includes(endKeyword)) {
        break
      }
      if (inSection && line.trim() && !line.match(/^#/)) {
        items.push(line.replace(/^[-*]\s*/, '').trim())
      }
    }
    
    return items
  }

  private parseProjectStatus(status: string): Project['status'] {
    const lowerStatus = status.toLowerCase()
    if (lowerStatus.includes('完成') || lowerStatus.includes('completed')) return 'completed'
    if (lowerStatus.includes('暂停') || lowerStatus.includes('paused')) return 'paused'
    if (lowerStatus.includes('归档') || lowerStatus.includes('archived')) return 'archived'
    return 'active'
  }

  generateMasterControlContent(mc: MasterControl): string {
    const today = new Date()
    const dateStr = today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    
    let content = `# 📅 ${dateStr} Master Control

## 🎯 今日重点

`
    
    for (const priority of mc.priorities.slice(0, 3)) {
      content += `1. ${priority}\n`
    }
    
    if (mc.priorities.length === 0) {
      content += `1. [待填写]\n`
    }
    
    content += `
## ⏰ 时间块安排

| 时间 | 任务类型 | 具体任务 | 状态 |
|------|---------|---------|------|
`
    
    for (const block of mc.timeBlocks) {
      content += `| ${block.start}-${block.end} | ${this.getTaskTypeLabel(block.type)} | ${block.task} | ${block.completed ? '✅' : '⬜'} |\n`
    }
    
    content += `
## 📋 任务清单

`
    
    const todoTasks = mc.tasks.filter(t => t.status === 'todo')
    const doneTasks = mc.tasks.filter(t => t.status === 'done')
    
    if (todoTasks.length > 0) {
      content += `### 待完成\n`
      for (const task of todoTasks) {
        content += `- [ ] ${task.content}\n`
      }
    }
    
    if (doneTasks.length > 0) {
      content += `\n### 已完成\n`
      for (const task of doneTasks) {
        content += `- [x] ${task.content}\n`
      }
    }
    
    content += `
## 💭 今日反思

`
    
    for (const reflection of mc.reflections) {
      content += `- ${reflection}\n`
    }
    
    if (mc.reflections.length === 0) {
      content += `- [待填写]\n`
    }
    
    content += `
---
**生成时间**: ${new Date().toLocaleString('zh-CN')}
`
    
    return content
  }

  private getTaskTypeLabel(type: TimeBlock['type']): string {
    const labels: Record<TimeBlock['type'], string> = {
      deep_work: '深度工作',
      shallow_work: '浅层工作',
      meeting: '会议',
      break: '休息'
    }
    return labels[type]
  }

  async getOrCreateMasterControl(): Promise<MasterControl> {
    let mc = await this.readMasterControl()
    
    if (!mc) {
      const today = new Date()
      const dateStr = today.toISOString().split('T')[0]
      
      mc = {
        date: dateStr,
        path: getDailyPlanPath(this.workspacePath, dateStr),
        content: '',
        tasks: [],
        priorities: [],
        timeBlocks: this.generateDefaultTimeBlocks(),
        reflections: []
      }
      
      await this.writeMasterControl(mc)
    }
    
    return mc
  }

  private generateDefaultTimeBlocks(): TimeBlock[] {
    return [
      { start: '09:00', end: '11:00', task: '深度工作时段 1', type: 'deep_work', completed: false },
      { start: '11:00', end: '12:00', task: '浅层工作/邮件', type: 'shallow_work', completed: false },
      { start: '12:00', end: '14:00', task: '午餐休息', type: 'break', completed: false },
      { start: '14:00', end: '16:00', task: '深度工作时段 2', type: 'deep_work', completed: false },
      { start: '16:00', end: '17:00', task: '会议/沟通', type: 'meeting', completed: false },
      { start: '17:00', end: '18:00', task: '整理/计划', type: 'shallow_work', completed: false }
    ]
  }

  async updateTaskStatus(mcPath: string, taskId: string, status: Task['status']): Promise<boolean> {
    if (!window.electronAPI) return false

    const result = await window.electronAPI.readFile(mcPath)
    if (!result.success || !result.content) return false

    const dateStr = mcPath.split('/').pop()?.split(' ')[0] || ''
    const mc = this.parseMasterControl(result.content, mcPath, dateStr)
    const task = mc.tasks.find(t => t.id === taskId)
    
    if (!task) return false

    task.status = status
    if (status === 'done') {
      task.completedAt = new Date().toISOString()
    }

    return this.writeMasterControl(mc)
  }
}

export const fileOperationLayer = new FileOperationLayer()
