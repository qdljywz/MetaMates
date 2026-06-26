import { ChatMessage } from '../chatHistory'

export interface CompressedContext {
  summary: string
  keyPoints: string[]
  preservedMessages: ChatMessage[]
  compressionRatio: number
  topics?: string[]
  entities?: Map<string, string[]>
}

export interface ContextCompressionConfig {
  maxTokens: number
  compressionThreshold: number
  preserveRecentCount: number
  importanceKeywords: string[]
  enableSemanticClustering: boolean
  enableEntityExtraction: boolean
  maxSummaryLength: number
}

const DEFAULT_CONFIG: ContextCompressionConfig = {
  maxTokens: 4096,
  compressionThreshold: 0.92,
  preserveRecentCount: 5,
  importanceKeywords: [
    '重要', '关键', '必须', '记住', '项目', '目标',
    '决定', '计划', '任务', '问题', '解决方案',
    '完成', '进度', '需求', '功能', 'bug', '修复',
    '优化', '测试', '部署', '版本', '更新',
  ],
  enableSemanticClustering: true,
  enableEntityExtraction: true,
  maxSummaryLength: 500,
}

interface MessageCluster {
  topic: string
  messages: ChatMessage[]
  summary: string
  importance: number
}

export class ContextCompressionService {
  private config: ContextCompressionConfig

  constructor(config: Partial<ContextCompressionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  estimateTokens(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length
    const numbers = (content.match(/\d+/g) || []).length
    const otherChars = content.length - chineseChars - englishWords * 2 - numbers

    return Math.ceil(chineseChars * 1.5 + englishWords + numbers * 0.5 + otherChars * 0.5)
  }

  estimateMessagesTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0)
  }

  shouldCompress(messages: ChatMessage[]): boolean {
    const tokens = this.estimateMessagesTokens(messages)
    return tokens > this.config.maxTokens * this.config.compressionThreshold
  }

  extractKeyPoints(content: string): string[] {
    const points: string[] = []
    const sentences = content.split(/[。！？\n]/)

    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (trimmed.length < 5) continue

      for (const keyword of this.config.importanceKeywords) {
        if (trimmed.includes(keyword)) {
          points.push(trimmed)
          break
        }
      }
    }

    return [...new Set(points)].slice(0, 10)
  }

  extractEntities(content: string): Map<string, string[]> {
    const entities = new Map<string, string[]>()

    const filePattern = /\[\[([^\]]+)\]\]/g
    const files: string[] = []
    let match
    while ((match = filePattern.exec(content)) !== null) {
      files.push(match[1])
    }
    if (files.length > 0) entities.set('file', files)

    const tagPattern = /#([^\s#]+)/g
    const tags: string[] = []
    while ((match = tagPattern.exec(content)) !== null) {
      tags.push(match[1])
    }
    if (tags.length > 0) entities.set('tag', tags)

    const datePattern = /\d{4}[-/]\d{1,2}[-/]\d{1,2}/g
    const dates = content.match(datePattern) || []
    if (dates.length > 0) entities.set('date', dates)

    const projectPattern = /项目[：:]\s*([^\n，。]+)/g
    const projects: string[] = []
    while ((match = projectPattern.exec(content)) !== null) {
      projects.push(match[1].trim())
    }
    if (projects.length > 0) entities.set('project', projects)

    return entities
  }

  calculateImportance(message: ChatMessage): number {
    let score = 0

    const content = message.content.toLowerCase()

    for (const keyword of this.config.importanceKeywords) {
      if (content.includes(keyword)) {
        score += 2
      }
    }

    if (message.intent) {
      score += 3
    }

    if (message.toolsUsed && message.toolsUsed.length > 0) {
      score += 2
    }

    const entities = this.extractEntities(message.content)
    score += entities.size * 1.5

    const recencyBonus = Math.max(0, 5 - (Date.now() - message.timestamp) / 3600000)
    score += recencyBonus

    if (content.includes('决定') || content.includes('确定') || content.includes('选择')) {
      score += 3
    }

    if (content.includes('问题') || content.includes('错误') || content.includes('失败')) {
      score += 2
    }

    return score
  }

  clusterMessages(messages: ChatMessage[]): MessageCluster[] {
    if (!this.config.enableSemanticClustering) {
      return []
    }

    const clusters: MessageCluster[] = []
    const topicKeywords: Map<string, ChatMessage[]> = new Map()

    const topicPatterns = [
      { pattern: /创建|新建|添加/, topic: '创建操作' },
      { pattern: /修改|更新|编辑/, topic: '修改操作' },
      { pattern: /删除|移除/, topic: '删除操作' },
      { pattern: /查询|搜索|查找/, topic: '查询操作' },
      { pattern: /总结|分析|报告/, topic: '分析操作' },
      { pattern: /计划|规划|安排/, topic: '计划任务' },
      { pattern: /问题|错误|bug|修复/, topic: '问题处理' },
    ]

    for (const msg of messages) {
      let assigned = false
      for (const { pattern, topic } of topicPatterns) {
        if (pattern.test(msg.content)) {
          if (!topicKeywords.has(topic)) {
            topicKeywords.set(topic, [])
          }
          topicKeywords.get(topic)!.push(msg)
          assigned = true
          break
        }
      }
      if (!assigned) {
        if (!topicKeywords.has('其他')) {
          topicKeywords.set('其他', [])
        }
        topicKeywords.get('其他')!.push(msg)
      }
    }

    for (const [topic, msgs] of topicKeywords) {
      if (msgs.length === 0) continue

      const importance = msgs.reduce((sum, m) => sum + this.calculateImportance(m), 0) / msgs.length

      const summary = this.generateTopicSummary(topic, msgs)

      clusters.push({
        topic,
        messages: msgs,
        summary,
        importance,
      })
    }

    return clusters.sort((a, b) => b.importance - a.importance)
  }

  private generateTopicSummary(topic: string, messages: ChatMessage[]): string {
    const keyPoints: string[] = []
    
    for (const msg of messages) {
      const points = this.extractKeyPoints(msg.content)
      keyPoints.push(...points.slice(0, 2))
    }

    const uniquePoints = [...new Set(keyPoints)].slice(0, 5)
    
    if (uniquePoints.length > 0) {
      return `${topic}: ${uniquePoints.join('; ')}`
    }
    
    return `${topic}: ${messages.length}条相关消息`
  }

  async compress(messages: ChatMessage[]): Promise<CompressedContext> {
    if (!this.shouldCompress(messages)) {
      return {
        summary: '',
        keyPoints: [],
        preservedMessages: messages,
        compressionRatio: 1,
      }
    }

    const recentMessages = messages.slice(-this.config.preserveRecentCount)

    const olderMessages = messages.slice(0, -this.config.preserveRecentCount)

    const clusters = this.clusterMessages(olderMessages)

    const scoredMessages = olderMessages.map(msg => ({
      message: msg,
      importance: this.calculateImportance(msg),
    }))

    scoredMessages.sort((a, b) => b.importance - a.importance)

    const importantMessages = scoredMessages
      .filter(s => s.importance > 3)
      .slice(0, 10)
      .map(s => s.message)

    const allKeyPoints: string[] = []
    const allEntities = new Map<string, string[]>()
    
    for (const msg of olderMessages) {
      allKeyPoints.push(...this.extractKeyPoints(msg.content))
      
      if (this.config.enableEntityExtraction) {
        const entities = this.extractEntities(msg.content)
        for (const [type, values] of entities) {
          if (!allEntities.has(type)) {
            allEntities.set(type, [])
          }
          allEntities.get(type)!.push(...values)
        }
      }
    }

    for (const [type, values] of allEntities) {
      allEntities.set(type, [...new Set(values)])
    }

    const summary = this.generateSummary(olderMessages, allKeyPoints, clusters)

    const preservedMessages = [...importantMessages, ...recentMessages]

    const originalTokens = this.estimateMessagesTokens(messages)
    const compressedTokens = this.estimateMessagesTokens(preservedMessages) + this.estimateTokens(summary)
    const compressionRatio = compressedTokens / originalTokens

    return {
      summary,
      keyPoints: [...new Set(allKeyPoints)].slice(0, 15),
      preservedMessages,
      compressionRatio,
      topics: clusters.map(c => c.topic),
      entities: allEntities,
    }
  }

  private generateSummary(messages: ChatMessage[], keyPoints: string[], clusters: MessageCluster[]): string {
    const parts: string[] = []

    if (keyPoints.length > 0) {
      parts.push('关键信息:')
      keyPoints.slice(0, 5).forEach(point => {
        parts.push(`- ${point}`)
      })
    }

    if (clusters.length > 0) {
      parts.push('')
      parts.push('主题概览:')
      clusters.slice(0, 5).forEach(cluster => {
        parts.push(`- ${cluster.summary}`)
      })
    }

    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    if (userMessages.length > 0) {
      parts.push('')
      parts.push(`用户提问了 ${userMessages.length} 个问题`)
    }

    if (assistantMessages.length > 0) {
      parts.push(`助手回复了 ${assistantMessages.length} 次`)
    }

    const toolsUsed = new Set<string>()
    messages.forEach(m => {
      m.toolsUsed?.forEach(t => toolsUsed.add(t))
    })
    if (toolsUsed.size > 0) {
      parts.push(`使用的工具: ${Array.from(toolsUsed).join(', ')}`)
    }

    let result = parts.join('\n')
    if (result.length > this.config.maxSummaryLength) {
      result = result.substring(0, this.config.maxSummaryLength) + '...'
    }

    return result
  }

  createContextWindow(messages: ChatMessage[], maxTokens: number = this.config.maxTokens): ChatMessage[] {
    let currentTokens = 0
    const result: ChatMessage[] = []

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens(messages[i].content)
      if (currentTokens + msgTokens > maxTokens) {
        break
      }
      result.unshift(messages[i])
      currentTokens += msgTokens
    }

    return result
  }

  getCompressionStats(messages: ChatMessage[]): {
    totalMessages: number
    totalTokens: number
    avgTokensPerMessage: number
    needsCompression: boolean
    estimatedCompressionRatio: number
  } {
    const totalTokens = this.estimateMessagesTokens(messages)
    const avgTokens = messages.length > 0 ? totalTokens / messages.length : 0

    return {
      totalMessages: messages.length,
      totalTokens,
      avgTokensPerMessage: Math.round(avgTokens),
      needsCompression: this.shouldCompress(messages),
      estimatedCompressionRatio: this.shouldCompress(messages) ? 0.3 : 1,
    }
  }
}

export const contextCompressionService = new ContextCompressionService()
