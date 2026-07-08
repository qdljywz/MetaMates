export interface MemoryEntry {
  id: string
  type: 'fact' | 'preference' | 'context' | 'action' | 'summary'
  content: string
  importance: number
  createdAt: number
  lastAccessed: number
  accessCount: number
  source: string
  metadata?: Record<string, any>
}

export interface MemorySection {
  name: string
  description: string
  entries: MemoryEntry[]
}

export interface LongTermMemory {
  version: string
  createdAt: number
  updatedAt: number
  userProfile: {
    name?: string
    preferences: Record<string, any>
    workContext: string[]
  }
  projectContext: {
    name?: string
    description?: string
    technologies: string[]
    conventions: string[]
  }
  knowledge: MemorySection[]
  conversationSummaries: {
    sessionId: string
    summary: string
    keyPoints: string[]
    timestamp: number
  }[]
}

const MEMORY_FILE = 'METAMATES.md'
const MEMORY_KEY = 'metamates_long_term_memory'

const DEFAULT_MEMORY: LongTermMemory = {
  version: '1.0.0',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  userProfile: {
    preferences: {},
    workContext: [],
  },
  projectContext: {
    technologies: [],
    conventions: [],
  },
  knowledge: [
    {
      name: '用户偏好',
      description: '用户的个人偏好和习惯',
      entries: [],
    },
    {
      name: '项目知识',
      description: '关于项目的关键信息',
      entries: [],
    },
    {
      name: '常用操作',
      description: '用户经常执行的操作模式',
      entries: [],
    },
  ],
  conversationSummaries: [],
}

export class LongTermMemoryService {
  private memory: LongTermMemory
  private storageKey: string

  constructor(storageKey: string = MEMORY_KEY) {
    this.storageKey = storageKey
    this.memory = this.load()
  }

  private load(): LongTermMemory {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const data = JSON.parse(stored)
        return { ...DEFAULT_MEMORY, ...data }
      }
    } catch (error) {
      console.error('Failed to load long-term memory:', error)
    }
    return { ...DEFAULT_MEMORY }
  }

  private save(): void {
    try {
      this.memory.updatedAt = Date.now()
      localStorage.setItem(this.storageKey, JSON.stringify(this.memory))
    } catch (error) {
      console.error('Failed to save long-term memory:', error)
    }
  }

  async saveToFile(workspacePath: string): Promise<void> {
    const content = this.generateMemoryFile()
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.writeFile(workspacePath, MEMORY_FILE, content)
      }
    } catch (error) {
      console.error('Failed to save memory file:', error)
    }
  }

  async loadFromFile(workspacePath: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const content = await (window as any).electronAPI.readFile(workspacePath, MEMORY_FILE)
        if (content) {
          this.parseMemoryFile(content)
        }
      }
    } catch (error) {
      console.error('Failed to load memory file:', error)
    }
  }

  private generateMemoryFile(): string {
    const lines: string[] = [
      '# MetaMates 长期记忆',
      '',
      '> 此文件由 MetaMates Agent 自动维护，存储用户的偏好、项目知识和重要信息。',
      '',
      `最后更新: ${new Date(this.memory.updatedAt).toLocaleString('zh-CN')}`,
      '',
      '## 用户档案',
      '',
    ]

    if (this.memory.userProfile.name) {
      lines.push(`**姓名**: ${this.memory.userProfile.name}`)
    }

    if (Object.keys(this.memory.userProfile.preferences).length > 0) {
      lines.push('')
      lines.push('### 偏好设置')
      for (const [key, value] of Object.entries(this.memory.userProfile.preferences)) {
        lines.push(`- ${key}: ${JSON.stringify(value)}`)
      }
    }

    if (this.memory.userProfile.workContext.length > 0) {
      lines.push('')
      lines.push('### 工作上下文')
      this.memory.userProfile.workContext.forEach(ctx => {
        lines.push(`- ${ctx}`)
      })
    }

    lines.push('')
    lines.push('## 项目上下文')
    lines.push('')

    if (this.memory.projectContext.name) {
      lines.push(`**项目名称**: ${this.memory.projectContext.name}`)
    }
    if (this.memory.projectContext.description) {
      lines.push(`**描述**: ${this.memory.projectContext.description}`)
    }

    if (this.memory.projectContext.technologies.length > 0) {
      lines.push('')
      lines.push('### 技术栈')
      this.memory.projectContext.technologies.forEach(tech => {
        lines.push(`- ${tech}`)
      })
    }

    if (this.memory.projectContext.conventions.length > 0) {
      lines.push('')
      lines.push('### 代码规范')
      this.memory.projectContext.conventions.forEach(conv => {
        lines.push(`- ${conv}`)
      })
    }

    for (const section of this.memory.knowledge) {
      if (section.entries.length > 0) {
        lines.push('')
        lines.push(`## ${section.name}`)
        lines.push('')
        lines.push(`_${section.description}_`)
        lines.push('')

        const sortedEntries = [...section.entries].sort((a, b) => b.importance - a.importance)
        for (const entry of sortedEntries) {
          lines.push(`### ${entry.type}: ${entry.content.substring(0, 50)}...`)
          lines.push(`- 内容: ${entry.content}`)
          lines.push(`- 重要性: ${entry.importance}/10`)
          lines.push(`- 访问次数: ${entry.accessCount}`)
          lines.push(`- 来源: ${entry.source}`)
          lines.push('')
        }
      }
    }

    if (this.memory.conversationSummaries.length > 0) {
      lines.push('')
      lines.push('## 对话历史摘要')
      lines.push('')

      const recentSummaries = this.memory.conversationSummaries.slice(-10)
      for (const summary of recentSummaries) {
        lines.push(`### ${new Date(summary.timestamp).toLocaleDateString('zh-CN')}`)
        lines.push(summary.summary)
        if (summary.keyPoints.length > 0) {
          lines.push('')
          lines.push('关键点:')
          summary.keyPoints.forEach(point => {
            lines.push(`- ${point}`)
          })
        }
        lines.push('')
      }
    }

    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('*此记忆文件帮助 Agent 更好地理解用户需求和项目上下文。*')

    return lines.join('\n')
  }

  private parseMemoryFile(content: string): void {
    const lines = content.split('\n')

    for (const line of lines) {
      if (line.startsWith('**姓名**:')) {
        this.memory.userProfile.name = line.split(':')[1].trim()
      } else if (line.startsWith('**项目名称**:')) {
        this.memory.projectContext.name = line.split(':')[1].trim()
      } else if (line.startsWith('**描述**:')) {
        this.memory.projectContext.description = line.split(':').slice(1).join(':').trim()
      }
    }

    this.save()
  }

  addFact(content: string, importance: number = 5, source: string = 'user'): MemoryEntry {
    const entry: MemoryEntry = {
      id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'fact',
      content,
      importance: Math.min(10, Math.max(1, importance)),
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      source,
    }

    const section = this.memory.knowledge.find(s => s.name === '项目知识')
    if (section) {
      section.entries.push(entry)
      this.pruneEntries(section)
      this.save()
    }

    return entry
  }

  addPreference(key: string, value: unknown, source: string = 'user'): void {
    this.memory.userProfile.preferences[key] = value

    const section = this.memory.knowledge.find(s => s.name === '用户偏好')
    if (section) {
      const existing = section.entries.find(e => e.content.includes(key))
      if (existing) {
        existing.content = `${key}: ${JSON.stringify(value)}`
        existing.lastAccessed = Date.now()
        existing.accessCount++
      } else {
        section.entries.push({
          id: `pref_${Date.now()}`,
          type: 'preference',
          content: `${key}: ${JSON.stringify(value)}`,
          importance: 7,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          source,
        })
      }
      this.save()
    }
  }

  addConversationSummary(sessionId: string, summary: string, keyPoints: string[]): void {
    this.memory.conversationSummaries.push({
      sessionId,
      summary,
      keyPoints,
      timestamp: Date.now(),
    })

    if (this.memory.conversationSummaries.length > 20) {
      this.memory.conversationSummaries = this.memory.conversationSummaries.slice(-20)
    }

    this.save()
  }

  recordAction(action: string, success: boolean): void {
    const section = this.memory.knowledge.find(s => s.name === '常用操作')
    if (section) {
      const existing = section.entries.find(e => e.content.includes(action))
      if (existing) {
        existing.lastAccessed = Date.now()
        existing.accessCount++
        existing.importance = Math.min(10, existing.importance + 0.5)
      } else {
        section.entries.push({
          id: `action_${Date.now()}`,
          type: 'action',
          content: action,
          importance: success ? 5 : 3,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          source: 'agent',
          metadata: { success },
        })
      }
      this.save()
    }
  }

  getRelevantContext(query: string, limit: number = 5): string[] {
    const results: { entry: MemoryEntry; score: number }[] = []
    const queryLower = query.toLowerCase()

    for (const section of this.memory.knowledge) {
      for (const entry of section.entries) {
        let score = 0

        if (entry.content.toLowerCase().includes(queryLower)) {
          score += 10
        }

        score += entry.importance
        score += Math.min(entry.accessCount, 5)

        if (score > 5) {
          results.push({ entry, score })
        }
      }
    }

    results.sort((a, b) => b.score - a.score)

    return results.slice(0, limit).map(r => {
      r.entry.lastAccessed = Date.now()
      r.entry.accessCount++
      return r.entry.content
    })
  }

  getMemoryContext(): string {
    const context: string[] = []

    if (this.memory.userProfile.name) {
      context.push(`用户姓名: ${this.memory.userProfile.name}`)
    }

    if (this.memory.projectContext.name) {
      context.push(`项目: ${this.memory.projectContext.name}`)
    }

    const importantFacts = this.getRelevantContext('', 3)
    if (importantFacts.length > 0) {
      context.push('重要信息:')
      importantFacts.forEach(fact => context.push(`- ${fact}`))
    }

    return context.join('\n')
  }

  private pruneEntries(section: MemorySection): void {
    if (section.entries.length > 100) {
      section.entries.sort((a, b) => {
        const scoreA = a.importance * 0.5 + (a.accessCount * 0.3) + ((Date.now() - a.lastAccessed) / 86400000 * 0.2)
        const scoreB = b.importance * 0.5 + (b.accessCount * 0.3) + ((Date.now() - b.lastAccessed) / 86400000 * 0.2)
        return scoreB - scoreA
      })

      section.entries = section.entries.slice(0, 100)
    }
  }

  getStats(): {
    totalEntries: number
    totalSummaries: number
    oldestEntry: number | null
    newestEntry: number | null
  } {
    let totalEntries = 0
    let oldestEntry: number | null = null
    let newestEntry: number | null = null

    for (const section of this.memory.knowledge) {
      totalEntries += section.entries.length
      for (const entry of section.entries) {
        if (!oldestEntry || entry.createdAt < oldestEntry) {
          oldestEntry = entry.createdAt
        }
        if (!newestEntry || entry.createdAt > newestEntry) {
          newestEntry = entry.createdAt
        }
      }
    }

    return {
      totalEntries,
      totalSummaries: this.memory.conversationSummaries.length,
      oldestEntry,
      newestEntry,
    }
  }

  clear(): void {
    this.memory = { ...DEFAULT_MEMORY }
    this.save()
  }
}

export const longTermMemoryService = new LongTermMemoryService()
