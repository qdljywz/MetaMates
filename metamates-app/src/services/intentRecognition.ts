export type IntentType = 
  | 'create_file'
  | 'modify_file'
  | 'delete_file'
  | 'read_file'
  | 'summarize'
  | 'analyze'
  | 'recommend'
  | 'search'
  | 'plan'
  | 'review'
  | 'move_file'
  | 'rename_file'
  | 'batch_create'
  | 'template'
  | 'daily_note'
  | 'extract_tasks'
  | 'find_links'
  | 'list_files'
  | 'append_file'
  | 'chat'

export interface Intent {
  type: IntentType
  confidence: number
  target?: string
  content?: string
  keywords: string[]
  entities?: Entity[]
  secondaryIntents?: { type: IntentType; confidence: number }[]
}

export interface Entity {
  type: 'file' | 'tag' | 'date' | 'number' | 'text'
  value: string
  start: number
  end: number
}

interface IntentPattern {
  patterns: RegExp[]
  weight: number
  extractEntities?: (input: string) => Entity[]
}

export class IntentRecognitionService {
  private static readonly INTENT_CONFIG: Record<IntentType, IntentPattern> = {
    create_file: {
      patterns: [
        /帮我?创建/,
        /新建/,
        /写一个/,
        /创建一个/,
        /帮我?写/,
        /生成一个/,
        /添加一个/,
        /建立一个/,
        /制作一个/,
        /编写/,
        /生成测试/,
        /写测试/,
        /创建测试/,
        /生成代码/,
        /写代码/,
      ],
      weight: 1.0,
      extractEntities: (input) => {
        const entities: Entity[] = []
        const fileMatch = input.match(/(?:创建|新建|写|生成|添加|建立|制作|编写)(?:一个)?(?:叫)?["']?([^"'\s,，。]+?)["']?(?:的)?(?:文件|笔记|文档)/)
        if (fileMatch) {
          entities.push({
            type: 'file',
            value: fileMatch[1],
            start: fileMatch.index || 0,
            end: (fileMatch.index || 0) + fileMatch[0].length,
          })
        }
        return entities
      },
    },
    modify_file: {
      patterns: [
        /修改/,
        /更新/,
        /编辑/,
        /在.*中添加/,
        /在.*里添加/,
        /给.*添加/,
        /改一下/,
        /修改一下/,
        /调整/,
        /改动/,
        /修复/,
        /fix/,
        /bug/,
        /重构/,
        /优化代码/,
        /改进/,
      ],
      weight: 1.0,
    },
    delete_file: {
      patterns: [
        /删除/,
        /移除/,
        /去掉/,
        /删掉/,
        /清除/,
      ],
      weight: 1.0,
    },
    read_file: {
      patterns: [
        /读取/,
        /打开/,
        /查看/,
        /显示/,
        /看看/,
        /浏览/,
        /阅读/,
        /读一下/,
        /读/,
      ],
      weight: 0.8,
    },
    summarize: {
      patterns: [
        /总结/,
        /摘要/,
        /概括/,
        /归纳/,
        /提炼/,
        /简要说明/,
        /一句话概括/,
      ],
      weight: 0.9,
    },
    analyze: {
      patterns: [
        /分析/,
        /研究/,
        /深入/,
        /评估/,
        /对比/,
        /比较/,
        /剖析/,
        /代码质量/,
        /质量分析/,
        /检查代码/,
        /审查/,
        /诊断/,
      ],
      weight: 0.9,
    },
    recommend: {
      patterns: [
        /推荐/,
        /建议/,
        /有什么/,
        /哪些/,
        /推荐一些/,
        /给点建议/,
      ],
      weight: 0.8,
    },
    search: {
      patterns: [
        /搜索/,
        /查找/,
        /寻找/,
        /找到/,
        /找找/,
        /检索/,
        /搜/,
        /关键词/,
        /查询/,
        /检索/,
      ],
      weight: 0.8,
    },
    plan: {
      patterns: [
        /计划/,
        /规划/,
        /安排/,
        /日程/,
        /制定/,
        /排期/,
        /帮我.*创建.*文档/,
        /完整.*文档/,
        /项目文档/,
        /分解/,
        /步骤/,
        /任务列表/,
        /待办/,
        /todo/,
      ],
      weight: 0.9,
    },
    review: {
      patterns: [
        /复盘/,
        /回顾/,
        /总结今天/,
        /今日总结/,
        /周报/,
        /日报/,
      ],
      weight: 0.9,
    },
    move_file: {
      patterns: [
        /移动/,
        /移到/,
        /移至/,
        /转移到/,
      ],
      weight: 1.0,
    },
    rename_file: {
      patterns: [
        /重命名/,
        /改名/,
        /改名为/,
        /重命名为/,
        /改个名字/,
      ],
      weight: 1.0,
    },
    batch_create: {
      patterns: [
        /批量创建/,
        /批量新建/,
        /一次创建/,
        /同时创建/,
        /批量生成/,
      ],
      weight: 1.0,
    },
    template: {
      patterns: [
        /模板/,
        /使用模板/,
        /套用模板/,
        /从模板/,
      ],
      weight: 0.9,
    },
    daily_note: {
      patterns: [
        /今日笔记/,
        /今天的笔记/,
        /日记/,
        /每日笔记/,
        /daily/,
        /今天记录/,
      ],
      weight: 1.0,
    },
    extract_tasks: {
      patterns: [
        /提取任务/,
        /找出任务/,
        /列出任务/,
        /待办/,
        /todo/,
        /待办事项/,
      ],
      weight: 0.9,
    },
    find_links: {
      patterns: [
        /查找链接/,
        /找出链接/,
        /关系图谱/,
        /文件关系/,
        /链接关系/,
      ],
      weight: 0.9,
    },
    list_files: {
      patterns: [
        /列出.*文件/,
        /显示.*文件/,
        /查看.*文件/,
        /列出工作区/,
        /列出所有/,
        /列出文件/,
        /有哪些文件/,
        /文件列表/,
        /所有文件/,
      ],
      weight: 1.0,
    },
    append_file: {
      patterns: [
        /追加/,
        /追加到/,
        /追加内容/,
        /在.*末尾/,
        /添加到.*文件/,
        /追加到文件/,
        /文件末尾/,
      ],
      weight: 1.0,
    },
    chat: {
      patterns: [],
      weight: 0.1,
    },
  }

  private static readonly ENTITY_PATTERNS: { type: Entity['type']; pattern: RegExp }[] = [
    { type: 'tag', pattern: /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g },
    { type: 'file', pattern: /\[\[([^\]]+)\]\]/g },
    { type: 'date', pattern: /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/g },
    { type: 'number', pattern: /(\d+)/g },
  ]

  static recognize(input: string): Intent {
    const normalizedInput = input.toLowerCase().trim()
    const keywords = this.extractKeywords(normalizedInput)
    const entities = this.extractEntities(normalizedInput)
    
    const scores: Map<IntentType, number> = new Map()
    
    for (const [intentType, config] of Object.entries(this.INTENT_CONFIG)) {
      let score = 0
      for (const pattern of config.patterns) {
        if (pattern.test(normalizedInput)) {
          score += config.weight
        }
      }
      if (score > 0) {
        scores.set(intentType as IntentType, score)
      }
    }

    const sortedScores = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])
    
    let bestIntent: IntentType = 'chat'
    let maxScore = 0
    
    if (sortedScores.length > 0) {
      bestIntent = sortedScores[0][0]
      maxScore = sortedScores[0][1]
    }

    const confidence = maxScore > 0 ? Math.min(maxScore / 2, 1) : 0.3
    const target = this.extractTarget(normalizedInput, entities)
    const content = this.extractContent(normalizedInput)
    
    const secondaryIntents = sortedScores
      .slice(1, 3)
      .map(([type, score]) => ({ type, confidence: Math.min(score / 2, 1) }))
      .filter(i => i.confidence > 0.3)

    return {
      type: bestIntent,
      confidence,
      target,
      content,
      keywords,
      entities,
      secondaryIntents: secondaryIntents.length > 0 ? secondaryIntents : undefined,
    }
  }

  private static extractEntities(input: string): Entity[] {
    const entities: Entity[] = []
    
    for (const { type, pattern } of this.ENTITY_PATTERNS) {
      let match
      const regex = new RegExp(pattern.source, pattern.flags)
      while ((match = regex.exec(input)) !== null) {
        entities.push({
          type,
          value: match[1],
          start: match.index,
          end: match.index + match[0].length,
        })
      }
    }
    
    return entities.sort((a, b) => a.start - b.start)
  }

  private static extractKeywords(input: string): string[] {
    const stopWords = new Set([
      '的', '了', '是', '在', '有', '和', '与', '或', '我', '你', '他', '她', '它',
      '这', '那', '什么', '怎么', '如何', '为什么', '哪', '吗', '呢', '吧', '啊',
      '一个', '一下', '一些', '这个', '那个', '可以', '能够', '需要', '应该',
      '请', '帮', '帮我', '帮忙', '想要', '希望', '想', '要',
      '搜索', '查找', '寻找', '检索', '查询', '找', '搜',
    ])
    
    const keywordPattern = input.match(/关键词[是为：:]*\s*([a-zA-Z0-9_\u4e00-\u9fa5]+)/)
    if (keywordPattern) {
      return [keywordPattern[1]]
    }
    
    const searchPattern = input.match(/(?:搜索|查找|寻找|检索|查询|找|搜)\s*([a-zA-Z0-9_\u4e00-\u9fa5]+)/)
    if (searchPattern) {
      return [searchPattern[1]]
    }
    
    const words = input.split(/[\s,，。！？、；：""''（）【】《》\n]+/)
    
    return words
      .filter(word => word.length > 1 && !stopWords.has(word))
      .slice(0, 10)
  }

  private static extractTarget(input: string, entities: Entity[]): string | undefined {
    const fileEntity = entities.find(e => e.type === 'file')
    if (fileEntity) return fileEntity.value
    
    const patterns = [
      /["']([^"']+)["']/,
      /《([^》]+)》/,
      /【([^】]+)】/,
      /文件[：:]\s*([^\s,，。]+)/,
      /笔记[：:]\s*([^\s,，。]+)/,
      /(?:创建|新建|写|生成|添加|建立|制作|编写)(?:一个)?(?:叫)?["']?([^"'\s,，。]+?)["']?(?:的)?(?:文件|笔记|文档)/,
      /(?:读取|打开|查看|显示|看看|浏览|阅读|读一下|读)([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/,
      /([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)(?:文件)?/,
    ]

    for (const pattern of patterns) {
      const match = input.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return undefined
  }

  private static extractContent(input: string): string | undefined {
    const contentMatch = input.match(/内容[是为：:]\s*(.+?)(?:$|[。！？])/)
    if (contentMatch) {
      return contentMatch[1]
    }
    return undefined
  }

  static isFileOperation(intent: Intent): boolean {
    return ['create_file', 'modify_file', 'delete_file', 'read_file', 'move_file', 'rename_file', 'batch_create'].includes(intent.type)
  }

  static needsContext(intent: Intent): boolean {
    return ['summarize', 'analyze', 'recommend', 'plan', 'review', 'extract_tasks', 'find_links'].includes(intent.type)
  }

  static generatePrompt(intent: Intent, context: {
    workspacePath?: string
    currentFile?: string
    fileContents?: { name: string; content: string }[]
  }): string {
    const basePrompt = this.getBasePrompt(intent)
    const contextPrompt = this.getContextPrompt(intent, context)
    
    return `${basePrompt}\n\n${contextPrompt}`
  }

  private static getBasePrompt(intent: Intent): string {
    const prompts: Record<IntentType, string> = {
      create_file: `用户想要创建文件。请根据用户的描述创建一个合适的markdown文件。
如果用户指定了文件名，使用用户指定的名称；否则根据内容自动生成一个合适的文件名。
使用【文件操作】格式输出文件内容。`,
      
      modify_file: `用户想要修改文件。请根据用户的描述修改指定的文件。
如果用户没有指定文件，请询问要修改哪个文件。
使用【文件操作】格式输出修改后的完整文件内容。`,
      
      delete_file: `用户想要删除文件。请确认要删除的文件，然后告知用户。`,
      
      read_file: `用户想要读取文件。请展示文件内容。`,
      
      summarize: `用户想要总结内容。请基于提供的文件内容生成简洁准确的摘要。
突出重点信息，使用列表形式呈现。`,
      
      analyze: `用户想要深入分析。请基于提供的文件内容进行深度分析。
识别关键模式、问题和机会，提供有价值的见解。`,
      
      recommend: `用户想要获得推荐。请基于工作区内容提供相关建议。
建议应该具体、可执行，并解释原因。`,
      
      search: `用户想要搜索。请在工作区文件中搜索相关内容。`,
      
      plan: `用户想要制定计划。请基于工作区内容帮助用户规划。
使用SMART原则，确保计划具体、可衡量、可实现、相关、有时限。`,
      
      review: `用户想要复盘。请帮助用户回顾和总结。
识别完成的工作、未完成的事项、学到的经验。`,
      
      move_file: `用户想要移动文件。请确认源文件和目标位置。`,
      
      rename_file: `用户想要重命名文件。请确认原文件名和新文件名。`,
      
      batch_create: `用户想要批量创建文件。请根据描述创建多个文件。`,
      
      template: `用户想要使用模板创建文件。请选择合适的模板并填充内容。`,
      
      daily_note: `用户想要创建今日笔记。请创建一个包含今日日期的笔记文件。`,
      
      extract_tasks: `用户想要提取任务。请从工作区文件中提取所有待办事项。`,
      
      find_links: `用户想要查看文件关系。请分析文件之间的链接关系。`,
      
      append_file: `用户想要追加内容到文件。请在文件末尾添加指定内容。`,
      
      list_files: `用户想要列出文件。请显示目录中的文件列表。`,
      
      chat: `请根据用户的请求提供帮助。`,
    }
    
    return prompts[intent.type] || prompts.chat
  }

  private static getContextPrompt(_intent: Intent, context: {
    workspacePath?: string
    currentFile?: string
    fileContents?: { name: string; content: string }[]
  }): string {
    let prompt = ''
    
    if (context.workspacePath) {
      prompt += `工作区路径：${context.workspacePath}\n`
    }
    
    if (context.currentFile) {
      prompt += `当前打开文件：${context.currentFile}\n`
    }
    
    if (context.fileContents && context.fileContents.length > 0) {
      prompt += `\n工作区文件内容：\n`
      for (const file of context.fileContents) {
        prompt += `\n--- ${file.name} ---\n${file.content.slice(0, 2000)}\n`
      }
    }
    
    return prompt
  }

  static suggestNextAction(intent: Intent): string[] {
    const suggestions: Record<IntentType, string[]> = {
      create_file: ['编辑这个文件', '添加更多内容', '创建相关文件'],
      modify_file: ['查看修改结果', '继续编辑', '撤销修改'],
      delete_file: ['确认删除', '取消操作'],
      read_file: ['总结内容', '分析内容', '编辑文件'],
      summarize: ['深入分析', '创建摘要文件', '分享摘要'],
      analyze: ['生成报告', '提出建议', '创建行动计划'],
      recommend: ['执行建议', '了解更多', '保存建议'],
      search: ['打开文件', '查看更多结果', '优化搜索'],
      plan: ['创建任务', '设置提醒', '分享计划'],
      review: ['创建复盘文档', '制定改进计划', '分享经验'],
      move_file: ['确认移动', '取消操作'],
      rename_file: ['确认重命名', '取消操作'],
      batch_create: ['查看创建的文件', '继续创建更多'],
      template: ['选择模板', '自定义模板'],
      daily_note: ['添加内容', '查看历史笔记'],
      extract_tasks: ['创建任务清单', '设置优先级'],
      find_links: ['打开图谱视图', '查看详情'],
      append_file: ['查看文件', '继续追加'],
      list_files: ['打开文件', '搜索文件'],
      chat: ['继续对话', '提出新问题'],
    }
    
    return suggestions[intent.type] || suggestions.chat
  }
}

export const intentRecognitionService = new IntentRecognitionService()
