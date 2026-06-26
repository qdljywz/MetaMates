import { BaseTool, ToolSchema, ToolResult, ToolExecutionContext } from './base'

export class SummarizeTool extends BaseTool {
  schema: ToolSchema = {
    name: 'summarize',
    description: '总结文件或工作区内容。当用户想快速了解文件或工作区的主要内容时使用。',
    parameters: [
      {
        name: 'target',
        type: 'string',
        description: '要总结的目标，可以是文件名、"工作区"或"当前文件"',
        required: false,
        default: '当前文件',
      },
    ],
    category: 'analysis',
    requiresConfirmation: false,
  }

  validateParams(_params: Record<string, any>): { valid: boolean; error?: string } {
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const target = params.target || '当前文件'
    
    let contentToSummarize = ''
    let targetName = target
    
    if (target === '工作区' || target === '全部') {
      if (context.fileContents && context.fileContents.length > 0) {
        contentToSummarize = context.fileContents.map(f => `【${f.name}】\n${f.content}`).join('\n\n---\n\n')
        targetName = `工作区 (${context.fileContents.length} 个文件)`
      }
    } else if (target === '当前文件' || !target) {
      if (context.currentFile && context.fileContents) {
        const currentFileContent = context.fileContents.find(f => context.currentFile?.includes(f.name))
        if (currentFileContent) {
          contentToSummarize = currentFileContent.content
          targetName = currentFileContent.name
        }
      }
    } else {
      if (context.fileContents) {
        const targetFile = context.fileContents.find(f => f.name.includes(target))
        if (targetFile) {
          contentToSummarize = targetFile.content
          targetName = targetFile.name
        }
      }
    }
    
    if (!contentToSummarize) {
      return {
        success: false,
        error: '没有可总结的内容',
        displayText: '❌ 没有找到可总结的内容',
        llmContent: 'Error: No content to summarize',
      }
    }
    
    return {
      success: true,
      data: { content: contentToSummarize, target: targetName },
      displayText: `📋 正在总结: ${targetName}\n内容长度: ${contentToSummarize.length} 字符`,
      llmContent: `Please summarize the following content from ${targetName}:\n\n${contentToSummarize.slice(0, 5000)}`,
    }
  }
}

export class AnalyzeTool extends BaseTool {
  schema: ToolSchema = {
    name: 'analyze',
    description: '深入分析文件或工作区内容。识别关键模式、问题和机会。',
    parameters: [
      {
        name: 'target',
        type: 'string',
        description: '要分析的目标',
        required: false,
        default: '工作区',
      },
      {
        name: 'focus',
        type: 'string',
        description: '分析焦点，如"任务"、"项目"、"时间线"等',
        required: false,
      },
    ],
    category: 'analysis',
    requiresConfirmation: false,
  }

  validateParams(_params: Record<string, any>): { valid: boolean; error?: string } {
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const target = params.target || '工作区'
    const focus = params.focus
    
    if (!context.fileContents || context.fileContents.length === 0) {
      return {
        success: false,
        error: '没有可分析的内容',
        displayText: '❌ 工作区没有文件可分析',
        llmContent: 'Error: No files to analyze',
      }
    }
    
    const content = context.fileContents.map(f => `【${f.name}】\n${f.content}`).join('\n\n---\n\n')
    const focusText = focus ? `\n\n分析焦点: ${focus}` : ''
    
    return {
      success: true,
      data: { content, target, focus },
      displayText: `🔍 正在分析: ${target}${focus ? ` (焦点: ${focus})` : ''}`,
      llmContent: `Please analyze the following content from ${target}.${focusText}\n\nContent:\n${content.slice(0, 8000)}`,
    }
  }
}

export class ExtractTasksTool extends BaseTool {
  schema: ToolSchema = {
    name: 'extract_tasks',
    description: '从文件中提取任务、待办事项.自动识别',
    parameters: [],
    category: 'analysis',
    requiresConfirmation: false,
  }

  validateParams(_params: Record<string, any>): { valid: boolean; error?: string } {
    return { valid: true }
  }

  async execute(_params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    if (!context.fileContents || context.fileContents.length === 0) {
      return {
        success: false,
        error: '没有可提取的文件',
        displayText: '❌ 工作区没有文件',
        llmContent: 'Error: No files to extract tasks from',
      }
    }
    
    const taskPatterns = [
      /- \[ \] .+/g,
      /\[ \] .+/g,
      /TODO: .+/gi,
      /待办: .+/g,
      /☐ .+/g,
    ]
    
    const allTasks: { file: string; tasks: string[] }[] = []
    
    for (const file of context.fileContents) {
      const tasks: string[] = []
      
      for (const pattern of taskPatterns) {
        const matches = file.content.match(pattern)
        if (matches) {
          tasks.push(...matches)
        }
      }
      
      if (tasks.length > 0) {
        allTasks.push({ file: file.name, tasks: [...new Set(tasks)] })
      }
    }
    
    if (allTasks.length > 0) {
      const totalTasks = allTasks.reduce((sum, f) => sum + f.tasks.length, 0)
      let displayText = `✅ 找到 ${totalTasks} 个待办任务:\n\n`
      
      allTasks.forEach(f => {
        displayText += `📄 ${f.file}\n`
        f.tasks.forEach(t => {
          displayText += `   ${t}\n`
        })
        displayText += '\n'
      })
      
      return {
        success: true,
        data: { tasks: allTasks, total: totalTasks },
        displayText,
        llmContent: `Found ${totalTasks} tasks across ${allTasks.length} files:\n${JSON.stringify(allTasks, null, 2)}`,
      }
    } else {
      return {
        success: false,
        error: '未找到任务',
        displayText: '❌ 未找到待办任务',
        llmContent: 'No tasks found in workspace',
      }
    }
  }
}

export class FindLinksTool extends BaseTool {
  schema: ToolSchema = {
    name: 'find_links',
    description: '查找文件中的双向链接 [[链接]] 和标签 #标签。',
    parameters: [
      {
        name: 'type',
        type: 'string',
        description: '查找类型: "links"(链接)、"tags"(标签) 或 "all"(全部)',
        required: false,
        default: 'all',
      },
    ],
    category: 'analysis',
    requiresConfirmation: false,
  }

  validateParams(_params: Record<string, any>): { valid: boolean; error?: string } {
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const type = params.type || 'all'
    
    if (!context.fileContents || context.fileContents.length === 0) {
      return {
        success: false,
        error: '没有可分析的文件',
        displayText: '❌ 工作区没有文件',
        llmContent: 'Error: No files to analyze',
      }
    }
    
    const linkPattern = /\[\[([^\]]+)\]\]/g
    const tagPattern = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g
    
    const results: { file: string; links: string[]; tags: string[] }[] = []
    
    for (const file of context.fileContents) {
      const links: string[] = []
      const tags: string[] = []
      
      if (type === 'links' || type === 'all') {
        let match
        while ((match = linkPattern.exec(file.content)) !== null) {
          links.push(match[1])
        }
      }
      
      if (type === 'tags' || type === 'all') {
        let match
        while ((match = tagPattern.exec(file.content)) !== null) {
          tags.push(match[1])
        }
      }
      
      if (links.length > 0 || tags.length > 0) {
        results.push({ file: file.name, links: [...new Set(links)], tags: [...new Set(tags)] })
      }
    }
    
    if (results.length > 0) {
      const totalLinks = results.reduce((sum, r) => sum + r.links.length, 0)
      const totalTags = results.reduce((sum, r) => sum + r.tags.length, 0)
      
      let displayText = `✅ 找到 ${totalLinks} 个链接和 ${totalTags} 个标签:\n\n`
      
      results.forEach(r => {
        displayText += `📄 ${r.file}\n`
        if (r.links.length > 0) {
          displayText += `   链接: ${r.links.map(l => `[[${l}]]`).join(', ')}\n`
        }
        if (r.tags.length > 0) {
          displayText += `   标签: ${r.tags.map(t => `#${t}`).join(', ')}\n`
        }
        displayText += '\n'
      })
      
      return {
        success: true,
        data: { results, totalLinks, totalTags },
        displayText,
        llmContent: `Found ${totalLinks} links and ${totalTags} tags:\n${JSON.stringify(results, null, 2)}`,
      }
    } else {
      return {
        success: false,
        error: '未找到链接或标签',
        displayText: '❌ 未找到双向链接或标签',
        llmContent: 'No links or tags found',
      }
    }
  }
}

export class GenerateReportTool extends BaseTool {
  schema: ToolSchema = {
    name: 'generate_report',
    description: '生成工作区报告，包括文件统计、任务统计、标签云等。',
    parameters: [
      {
        name: 'format',
        type: 'string',
        description: '报告格式: "summary"(摘要) 或 "detailed"(详细)',
        required: false,
        default: 'summary',
      },
    ],
    category: 'analysis',
    requiresConfirmation: false,
  }

  validateParams(_params: Record<string, any>): { valid: boolean; error?: string } {
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const format = params.format || 'summary'
    
    if (!context.fileContents || context.fileContents.length === 0) {
      return {
        success: false,
        error: '没有可分析的文件',
        displayText: '❌ 工作区没有文件',
        llmContent: 'Error: No files to analyze',
      }
    }
    
    const totalFiles = context.fileContents.length
    const totalSize = context.fileContents.reduce((sum, f) => sum + f.content.length, 0)
    
    const taskPattern = /- \[ \] .+/g
    let totalTasks = 0
    const completedTaskPattern = /- \[x\] .+/gi
    let completedTasks = 0
    
    context.fileContents.forEach(f => {
      const tasks = f.content.match(taskPattern)
      const completed = f.content.match(completedTaskPattern)
      if (tasks) totalTasks += tasks.length
      if (completed) completedTasks += completed.length
    })
    
    const tagPattern = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g
    const tagCounts: Record<string, number> = {}
    
    context.fileContents.forEach(f => {
      let match
      while ((match = tagPattern.exec(f.content)) !== null) {
        tagCounts[match[1]] = (tagCounts[match[1]] || 0) + 1
      }
    })
    
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    let displayText = `📊 工作区报告\n\n`
    displayText += `📁 文件统计\n`
    displayText += `   总文件数: ${totalFiles}\n`
    displayText += `   总字符数: ${totalSize.toLocaleString()}\n`
    displayText += `   平均文件大小: ${Math.round(totalSize / totalFiles).toLocaleString()} 字符\n\n`
    
    displayText += `✅ 任务统计\n`
    displayText += `   待办任务: ${totalTasks}\n`
    displayText += `   已完成任务: ${completedTasks}\n`
    displayText += `   完成率: ${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%\n\n`
    
    if (topTags.length > 0) {
      displayText += `🏷️ 热门标签\n`
      topTags.forEach(([tag, count]) => {
        displayText += `   #${tag}: ${count} 次\n`
      })
    }
    
    if (format === 'detailed') {
      displayText += `\n\n📄 文件列表\n`
      context.fileContents.forEach(f => {
        displayText += `   ${f.name} (${f.content.length} 字符)\n`
      })
    }
    
    return {
      success: true,
      data: {
        totalFiles,
        totalSize,
        totalTasks,
        completedTasks,
        tagCounts,
        topTags,
      },
      displayText,
      llmContent: `Workspace report:\n${displayText}`,
    }
  }
}

export const analysisTools = [
  new SummarizeTool(),
  new AnalyzeTool(),
  new ExtractTasksTool(),
  new FindLinksTool(),
  new GenerateReportTool(),
]
