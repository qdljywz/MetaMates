import { resolveMasterControlPath } from '../../constants/paths'
import type { FileInfo } from '../../types/electron'

export interface MasterControl {
  version: string
  lastUpdated: number
  projects: Project[]
  context: ContextSummary
  status: 'active' | 'archived' | 'pending'
}

export interface Project {
  id: string
  name: string
  status: 'active' | 'completed' | 'on-hold'
  startDate: number
  endDate?: number
  description: string
  tasks: Task[]
  relatedFiles: string[]
}

export interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
  dueDate?: number
  tags: string[]
}

export interface ContextSummary {
  totalProjects: number
  activeProjects: number
  totalTasks: number
  completedTasks: number
  recentActivity: Activity[]
}

export interface Activity {
  type: 'project-created' | 'task-completed' | 'file-updated' | 'context-loaded'
  timestamp: number
  description: string
}

export class MasterControlService {
  private masterControl: MasterControl | null = null

  async loadMasterControl(workspacePath: string): Promise<MasterControl | null> {
    if (!window.electronAPI) {
      return null
    }

    try {
      const mcPath = await resolveMasterControlPath(workspacePath)
      const result = await window.electronAPI.readFile(mcPath)
      if (result.success && result.content) {
        this.masterControl = this.parseMasterControl(result.content)
        return this.masterControl
      }
    } catch (error) {
      console.log('MasterControl not found, will create new one')
    }

    return null
  }

  async createMasterControl(workspacePath: string): Promise<MasterControl> {
    const newMasterControl: MasterControl = {
      version: '1.0',
      lastUpdated: Date.now(),
      projects: [],
      context: {
        totalProjects: 0,
        activeProjects: 0,
        totalTasks: 0,
        completedTasks: 0,
        recentActivity: [],
      },
      status: 'active',
    }

    await this.saveMasterControl(workspacePath, newMasterControl)
    this.masterControl = newMasterControl
    return newMasterControl
  }

  async saveMasterControl(workspacePath: string, masterControl: MasterControl): Promise<boolean> {
    if (!window.electronAPI) {
      return false
    }

    try {
      const content = this.formatMasterControl(masterControl)
      const mcPath = await resolveMasterControlPath(workspacePath)
      const result = await window.electronAPI.writeFile(mcPath, content)
      return result.success
    } catch (error) {
      console.error('Failed to save MasterControl:', error)
      return false
    }
  }

  async updateContext(workspacePath: string, files: FileInfo[]): Promise<void> {
    if (!this.masterControl) {
      return
    }

    const markdownFiles = files.filter(f => !f.isDirectory && f.name.endsWith('.md'))
    const projects = await this.discoverProjects(markdownFiles)
    
    this.masterControl.projects = projects
    this.masterControl.context.totalProjects = projects.length
    this.masterControl.context.activeProjects = projects.filter(p => p.status === 'active').length
    this.masterControl.context.totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0)
    this.masterControl.context.completedTasks = projects.reduce(
      (sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length,
      0
    )
    this.masterControl.lastUpdated = Date.now()

    await this.saveMasterControl(workspacePath, this.masterControl)
  }

  private async discoverProjects(files: FileInfo[]): Promise<Project[]> {
    const projects: Project[] = []

    for (const file of files) {
      if (!window.electronAPI) {
        continue
      }

      try {
        const result = await window.electronAPI.readFile(file.path)
        if (result.success && result.content) {
          const project = this.parseProjectFromContent(file.name, result.content)
          if (project) {
            projects.push(project)
          }
        }
      } catch (error) {
        console.log('Failed to read file:', file.name)
      }
    }

    return projects
  }

  private parseProjectFromContent(fileName: string, content: string): Project | null {
    const lines = content.split('\n')
    const project: Project = {
      id: fileName.replace('.md', ''),
      name: fileName.replace('.md', ''),
      status: 'active',
      startDate: Date.now(),
      description: '',
      tasks: [],
      relatedFiles: [fileName],
    }

    let inTasksSection = false

    for (const line of lines) {
      if (line.startsWith('# ')) {
        project.name = line.substring(2).trim()
      } else if (line.includes('项目目标') || line.includes('描述')) {
        const nextLine = lines[lines.indexOf(line) + 1]
        if (nextLine) {
          project.description = nextLine.trim()
        }
      } else if (line.includes('任务') || line.includes('Task')) {
        inTasksSection = true
      } else if (inTasksSection && line.startsWith('- [')) {
        const task: Task = {
          id: `task-${project.tasks.length}`,
          title: line.replace(/^- \[[ x]\]\s*/, '').trim(),
          status: line.includes('[x]') ? 'completed' : 'todo',
          priority: 'medium',
          tags: [],
        }
        project.tasks.push(task)
      }
    }

    return project.tasks.length > 0 ? project : null
  }

  private parseMasterControl(content: string): MasterControl {
    const lines = content.split('\n')
    const masterControl: MasterControl = {
      version: '1.0',
      lastUpdated: Date.now(),
      projects: [],
      context: {
        totalProjects: 0,
        activeProjects: 0,
        totalTasks: 0,
        completedTasks: 0,
        recentActivity: [],
      },
      status: 'active',
    }

    let inProjectsSection = false
    let currentProject: Project | null = null

    for (const line of lines) {
      if (line.startsWith('## 项目列表')) {
        inProjectsSection = true
      } else if (line.startsWith('## ') && !line.includes('项目列表')) {
        inProjectsSection = false
      } else if (inProjectsSection && line.startsWith('### ')) {
        if (currentProject) {
          masterControl.projects.push(currentProject)
        }
        currentProject = {
          id: line.substring(4).trim(),
          name: line.substring(4).trim(),
          status: 'active',
          startDate: Date.now(),
          description: '',
          tasks: [],
          relatedFiles: [],
        }
      } else if (currentProject && line.startsWith('- [')) {
        const task: Task = {
          id: `task-${currentProject.tasks.length}`,
          title: line.replace(/^- \[[ x]\]\s*/, '').trim(),
          status: line.includes('[x]') ? 'completed' : 'todo',
          priority: 'medium',
          tags: [],
        }
        currentProject.tasks.push(task)
      }
    }

    if (currentProject) {
      masterControl.projects.push(currentProject)
    }

    masterControl.context.totalProjects = masterControl.projects.length
    masterControl.context.activeProjects = masterControl.projects.filter(p => p.status === 'active').length
    masterControl.context.totalTasks = masterControl.projects.reduce((sum, p) => sum + p.tasks.length, 0)
    masterControl.context.completedTasks = masterControl.projects.reduce(
      (sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length,
      0
    )

    return masterControl
  }

  private formatMasterControl(masterControl: MasterControl): string {
    let content = `# Master Control\n\n`
    content += `**版本**：${masterControl.version}\n`
    content += `**最后更新**：${new Date(masterControl.lastUpdated).toLocaleString('zh-CN')}\n`
    content += `**状态**：${masterControl.status}\n\n`

    content += `## 上下文摘要\n\n`
    content += `- **项目总数**：${masterControl.context.totalProjects}\n`
    content += `- **活跃项目**：${masterControl.context.activeProjects}\n`
    content += `- **任务总数**：${masterControl.context.totalTasks}\n`
    content += `- **已完成任务**：${masterControl.context.completedTasks}\n\n`

    content += `## 项目列表\n\n`

    for (const project of masterControl.projects) {
      content += `### ${project.name}\n\n`
      content += `**状态**：${project.status}\n`
      content += `**描述**：${project.description}\n\n`
      content += `**任务**：\n\n`

      for (const task of project.tasks) {
        const checkbox = task.status === 'completed' ? '[x]' : '[ ]'
        content += `- ${checkbox} ${task.title}\n`
      }

      content += '\n'
    }

    return content
  }

  getMasterControl(): MasterControl | null {
    return this.masterControl
  }

  async addProject(workspacePath: string, project: Project): Promise<boolean> {
    if (!this.masterControl) {
      return false
    }

    this.masterControl.projects.push(project)
    this.masterControl.context.totalProjects = this.masterControl.projects.length
    this.masterControl.context.activeProjects = this.masterControl.projects.filter(p => p.status === 'active').length

    return await this.saveMasterControl(workspacePath, this.masterControl)
  }

  async updateProjectStatus(workspacePath: string, projectId: string, status: Project['status']): Promise<boolean> {
    if (!this.masterControl) {
      return false
    }

    const project = this.masterControl.projects.find(p => p.id === projectId)
    if (project) {
      project.status = status
      this.masterControl.context.activeProjects = this.masterControl.projects.filter(p => p.status === 'active').length
      return await this.saveMasterControl(workspacePath, this.masterControl)
    }

    return false
  }

  async updateTaskStatus(workspacePath: string, projectId: string, taskId: string, status: Task['status']): Promise<boolean> {
    if (!this.masterControl) {
      return false
    }

    const project = this.masterControl.projects.find(p => p.id === projectId)
    if (project) {
      const task = project.tasks.find(t => t.id === taskId)
      if (task) {
        task.status = status
        this.masterControl.context.completedTasks = this.masterControl.projects.reduce(
          (sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length,
          0
        )
        return await this.saveMasterControl(workspacePath, this.masterControl)
      }
    }

    return false
  }
}

export const masterControlService = new MasterControlService()
