import { BaseTool, ToolSchema, ToolResult, ToolExecutionContext } from './base'

export class ReadFileTool extends BaseTool {
  schema: ToolSchema = {
    name: 'read_file',
    description: '读取指定文件的内容。当用户想查看文件内容、了解文件信息时使用。',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: '要读取的文件路径，可以是绝对路径或相对于工作区的路径',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: false,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.file_path || typeof params.file_path !== 'string') {
      return { valid: false, error: 'file_path 参数必须是字符串' }
    }
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { file_path } = params
    
    if (!window.electronAPI) {
      return {
        success: false,
        error: 'Electron API 不可用',
        displayText: '❌ 无法读取文件：Electron API 不可用',
        llmContent: 'Error: Electron API not available',
      }
    }

    let fullPath = file_path
    if (context.workspacePath && !file_path.includes(':') && !file_path.startsWith('/')) {
      fullPath = await window.electronAPI.path.join(context.workspacePath, file_path)
    }

    const result = await window.electronAPI.readFile(fullPath)
    
    if (result.success && result.content) {
      return {
        success: true,
        data: { content: result.content, path: fullPath },
        displayText: `✅ 已读取文件: ${file_path}\n内容长度: ${result.content.length} 字符`,
        llmContent: `File content of ${file_path}:\n${result.content}`,
      }
    } else {
      return {
        success: false,
        error: result.error || '读取失败',
        displayText: `❌ 读取文件失败: ${result.error}`,
        llmContent: `Error reading file ${file_path}: ${result.error}`,
      }
    }
  }
}

export class WriteFileTool extends BaseTool {
  schema: ToolSchema = {
    name: 'write_file',
    description: '创建或覆盖写入文件。当用户想创建新文件或完全替换文件内容时使用。',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: '文件路径，可以是绝对路径或相对于工作区的路径',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: '要写入的文件内容',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: true,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.file_path || typeof params.file_path !== 'string') {
      return { valid: false, error: 'file_path 参数必须是字符串' }
    }
    if (!params.content || typeof params.content !== 'string') {
      return { valid: false, error: 'content 参数必须是字符串' }
    }
    return { valid: true }
  }

  getConfirmationMessage(params: Record<string, any>): string {
    return `确认要写入文件 "${params.file_path}" 吗？这将创建新文件或覆盖现有文件。`
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { file_path, content } = params
    
    if (!window.electronAPI) {
      return {
        success: false,
        error: 'Electron API 不可用',
        displayText: '❌ 无法写入文件：Electron API 不可用',
        llmContent: 'Error: Electron API not available',
      }
    }

    let fullPath = file_path
    if (context.workspacePath && !file_path.includes(':') && !file_path.startsWith('/')) {
      fullPath = await window.electronAPI.path.join(context.workspacePath, file_path)
    }

    const result = await window.electronAPI.writeFile(fullPath, content)
    
    if (result.success) {
      return {
        success: true,
        data: { path: fullPath, size: content.length },
        displayText: `✅ 已写入文件: ${file_path} (${content.length} 字符)`,
        llmContent: `Successfully wrote ${content.length} characters to ${file_path}`,
      }
    } else {
      return {
        success: false,
        error: result.error || '写入失败',
        displayText: `❌ 写入文件失败: ${result.error}`,
        llmContent: `Error writing file ${file_path}: ${result.error}`,
      }
    }
  }
}

export class AppendFileTool extends BaseTool {
  schema: ToolSchema = {
    name: 'append_file',
    description: '在文件末尾追加内容。当用户想在现有文件中添加内容而不覆盖原有内容时使用。',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: '文件路径',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: '要追加的内容',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: true,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.file_path || typeof params.file_path !== 'string') {
      return { valid: false, error: 'file_path 参数必须是字符串' }
    }
    if (!params.content || typeof params.content !== 'string') {
      return { valid: false, error: 'content 参数必须是字符串' }
    }
    return { valid: true }
  }

  getConfirmationMessage(params: Record<string, any>): string {
    return `确认要在文件 "${params.file_path}" 末尾追加内容吗？`
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { file_path, content } = params
    
    if (!window.electronAPI) {
      return {
        success: false,
        error: 'Electron API 不可用',
        displayText: '❌ 无法追加文件：Electron API 不可用',
        llmContent: 'Error: Electron API not available',
      }
    }

    let fullPath = file_path
    if (context.workspacePath && !file_path.includes(':') && !file_path.startsWith('/')) {
      fullPath = await window.electronAPI.path.join(context.workspacePath, file_path)
    }

    const readResult = await window.electronAPI.readFile(fullPath)
    let existingContent = ''
    if (readResult.success && readResult.content) {
      existingContent = readResult.content
    }

    const newContent = existingContent + '\n' + content
    const result = await window.electronAPI.writeFile(fullPath, newContent)
    
    if (result.success) {
      return {
        success: true,
        data: { path: fullPath, appendedSize: content.length },
        displayText: `✅ 已追加内容到文件: ${file_path} (+${content.length} 字符)`,
        llmContent: `Successfully appended ${content.length} characters to ${file_path}`,
      }
    } else {
      return {
        success: false,
        error: result.error || '追加失败',
        displayText: `❌ 追加文件失败: ${result.error}`,
        llmContent: `Error appending to file ${file_path}: ${result.error}`,
      }
    }
  }
}

export class DeleteFileTool extends BaseTool {
  schema: ToolSchema = {
    name: 'delete_file',
    description: '删除指定文件。谨慎使用，删除后无法恢复。',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: '要删除的文件路径',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: true,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.file_path || typeof params.file_path !== 'string') {
      return { valid: false, error: 'file_path 参数必须是字符串' }
    }
    return { valid: true }
  }

  getConfirmationMessage(params: Record<string, any>): string {
    return `⚠️ 确认要删除文件 "${params.file_path}" 吗？此操作不可撤销！`
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { file_path } = params
    
    if (!window.electronAPI) {
      return {
        success: false,
        error: 'Electron API 不可用',
        displayText: '❌ 无法删除文件：Electron API 不可用',
        llmContent: 'Error: Electron API not available',
      }
    }

    let fullPath = file_path
    if (context.workspacePath && !file_path.includes(':') && !file_path.startsWith('/')) {
      fullPath = await window.electronAPI.path.join(context.workspacePath, file_path)
    }

    const result = await window.electronAPI.deleteFile(fullPath)
    
    if (result.success) {
      return {
        success: true,
        data: { path: fullPath },
        displayText: `✅ 已删除文件: ${file_path}`,
        llmContent: `Successfully deleted file ${file_path}`,
      }
    } else {
      return {
        success: false,
        error: result.error || '删除失败',
        displayText: `❌ 删除文件失败: ${result.error}`,
        llmContent: `Error deleting file ${file_path}: ${result.error}`,
      }
    }
  }
}

export class ListFilesTool extends BaseTool {
  schema: ToolSchema = {
    name: 'list_files',
    description: '列出工作区或指定目录下的所有文件。当用户想查看有哪些文件时使用。',
    parameters: [
      {
        name: 'directory',
        type: 'string',
        description: '目录路径，不指定则列出工作区根目录',
        required: false,
        default: '.',
      },
      {
        name: 'pattern',
        type: 'string',
        description: '文件名模式，支持通配符，如 *.md',
        required: false,
      },
    ],
    category: 'file_system',
    requiresConfirmation: false,
  }

  validateParams(_params: Record<string, any>): { valid: boolean; error?: string } {
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const pattern = params.pattern
    
    if (!window.electronAPI || !context.workspacePath) {
      return {
        success: false,
        error: '工作区未设置',
        displayText: '❌ 请先打开工作区',
        llmContent: 'Error: Workspace not set',
      }
    }

    const result = await window.electronAPI.listFiles(context.workspacePath)
    
    if (result.success && result.files) {
      let files = result.files.filter(f => !f.isDirectory)
      
      if (pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
        files = files.filter(f => regex.test(f.name))
      }
      
      const fileList = files.map(f => `${f.name} (${f.path})`).join('\n')
      
      return {
        success: true,
        data: { files: files, count: files.length },
        displayText: `✅ 找到 ${files.length} 个文件:\n${fileList}`,
        llmContent: `Found ${files.length} files:\n${fileList}`,
      }
    } else {
      return {
        success: false,
        error: result.error || '列出文件失败',
        displayText: `❌ 列出文件失败: ${result.error}`,
        llmContent: `Error listing files: ${result.error}`,
      }
    }
  }
}

export class SearchContentTool extends BaseTool {
  schema: ToolSchema = {
    name: 'search_content',
    description: '在工作区文件中搜索包含特定内容的文件。当用户想查找包含某些关键词或文本的文件时使用。',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: '搜索关键词或文本',
        required: true,
      },
      {
        name: 'case_sensitive',
        type: 'boolean',
        description: '是否区分大小写',
        required: false,
        default: false,
      },
    ],
    category: 'file_system',
    requiresConfirmation: false,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.query || typeof params.query !== 'string') {
      return { valid: false, error: 'query 参数必须是字符串' }
    }
    return { valid: true }
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { query, case_sensitive = false } = params
    
    if (!context.fileContents || context.fileContents.length === 0) {
      return {
        success: false,
        error: '没有可搜索的文件',
        displayText: '❌ 工作区没有文件可搜索',
        llmContent: 'Error: No files to search',
      }
    }

    const results: { file: string; matches: { line: number; text: string }[] }[] = []
    const searchQuery = case_sensitive ? query : query.toLowerCase()
    
    for (const file of context.fileContents) {
      const lines = file.content.split('\n')
      const matches: { line: number; text: string }[] = []
      
      lines.forEach((line, index) => {
        const searchText = case_sensitive ? line : line.toLowerCase()
        if (searchText.includes(searchQuery)) {
          matches.push({ line: index + 1, text: line.trim() })
        }
      })
      
      if (matches.length > 0) {
        results.push({ file: file.name, matches })
      }
    }
    
    if (results.length > 0) {
      let displayText = `✅ 在 ${results.length} 个文件中找到 "${query}":\n\n`
      results.forEach(r => {
        displayText += `📄 ${r.file}\n`
        r.matches.slice(0, 3).forEach(m => {
          displayText += `   行 ${m.line}: ${m.text.slice(0, 100)}...\n`
        })
        if (r.matches.length > 3) {
          displayText += `   ... 还有 ${r.matches.length - 3} 个匹配\n`
        }
        displayText += '\n'
      })
      
      return {
        success: true,
        data: { results, totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0) },
        displayText,
        llmContent: `Found "${query}" in ${results.length} files with ${results.reduce((sum, r) => sum + r.matches.length, 0)} total matches`,
      }
    } else {
      return {
        success: false,
        error: '未找到匹配',
        displayText: `❌ 未找到包含 "${query}" 的内容`,
        llmContent: `No matches found for "${query}"`,
      }
    }
  }
}

export class MoveFileTool extends BaseTool {
  schema: ToolSchema = {
    name: 'move_file',
    description: '移动或重命名文件。当用户想要移动文件到其他位置或重命名文件时使用。',
    parameters: [
      {
        name: 'source',
        type: 'string',
        description: '源文件路径',
        required: true,
      },
      {
        name: 'destination',
        type: 'string',
        description: '目标文件路径',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: true,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.source || typeof params.source !== 'string') {
      return { valid: false, error: '源文件路径必须是非空字符串' }
    }
    if (!params.destination || typeof params.destination !== 'string') {
      return { valid: false, error: '目标文件路径必须是非空字符串' }
    }
    return { valid: true }
  }

  getConfirmationMessage(params: Record<string, any>): string {
    return `确定要将文件 "${params.source}" 移动/重命名为 "${params.destination}" 吗？`
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { source, destination } = params

    if (!window.electronAPI || !context.workspacePath) {
      return {
        success: false,
        error: '工作区未设置',
        displayText: '❌ 请先打开工作区',
        llmContent: 'Error: Workspace not set',
      }
    }

    const sourcePath = source.includes(context.workspacePath) 
      ? source 
      : await window.electronAPI.path.join(context.workspacePath, source)
    
    const destPath = destination.includes(context.workspacePath)
      ? destination
      : await window.electronAPI.path.join(context.workspacePath, destination)

    try {
      const readResult = await window.electronAPI.readFile(sourcePath)
      if (!readResult.success) {
        return {
          success: false,
          error: '无法读取源文件',
          displayText: `❌ 无法读取源文件: ${source}`,
          llmContent: `Error: Cannot read source file ${source}`,
        }
      }

      const writeResult = await window.electronAPI.writeFile(destPath, readResult.content || '')
      if (!writeResult.success) {
        return {
          success: false,
          error: '无法写入目标文件',
          displayText: `❌ 无法写入目标文件: ${destination}`,
          llmContent: `Error: Cannot write to destination ${destination}`,
        }
      }

      const deleteResult = await window.electronAPI.deleteFile(sourcePath)
      if (!deleteResult.success) {
        return {
          success: true,
          error: '源文件删除失败，但文件已复制',
          displayText: `⚠️ 文件已复制到 ${destination}，但源文件删除失败`,
          llmContent: `Warning: File copied to ${destination} but source deletion failed`,
        }
      }

      return {
        success: true,
        displayText: `✓ 文件已移动: ${source} → ${destination}`,
        llmContent: `File moved successfully from ${source} to ${destination}`,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        displayText: `❌ 移动文件失败: ${error.message}`,
        llmContent: `Error moving file: ${error.message}`,
      }
    }
  }
}

export class RenameFileTool extends BaseTool {
  schema: ToolSchema = {
    name: 'rename_file',
    description: '重命名文件。当用户想要更改文件名称时使用。',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: '要重命名的文件路径',
        required: true,
      },
      {
        name: 'new_name',
        type: 'string',
        description: '新的文件名',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: true,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.file_path || typeof params.file_path !== 'string') {
      return { valid: false, error: '文件路径必须是非空字符串' }
    }
    if (!params.new_name || typeof params.new_name !== 'string') {
      return { valid: false, error: '新文件名必须是非空字符串' }
    }
    return { valid: true }
  }

  getConfirmationMessage(params: Record<string, any>): string {
    return `确定要将文件重命名为 "${params.new_name}" 吗？`
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { file_path, new_name } = params

    if (!window.electronAPI || !context.workspacePath) {
      return {
        success: false,
        error: '工作区未设置',
        displayText: '❌ 请先打开工作区',
        llmContent: 'Error: Workspace not set',
      }
    }

    const sourcePath = file_path.includes(context.workspacePath)
      ? file_path
      : await window.electronAPI.path.join(context.workspacePath, file_path)

    const dir = await window.electronAPI.path.dirname(sourcePath)
    const destPath = await window.electronAPI.path.join(dir, new_name)

    try {
      const readResult = await window.electronAPI.readFile(sourcePath)
      if (!readResult.success) {
        return {
          success: false,
          error: '无法读取文件',
          displayText: `❌ 无法读取文件: ${file_path}`,
          llmContent: `Error: Cannot read file ${file_path}`,
        }
      }

      const writeResult = await window.electronAPI.writeFile(destPath, readResult.content || '')
      if (!writeResult.success) {
        return {
          success: false,
          error: '无法创建新文件',
          displayText: `❌ 无法创建新文件: ${new_name}`,
          llmContent: `Error: Cannot create new file ${new_name}`,
        }
      }

      const deleteResult = await window.electronAPI.deleteFile(sourcePath)
      if (!deleteResult.success) {
        return {
          success: true,
          error: '原文件删除失败',
          displayText: `⚠️ 已创建新文件 ${new_name}，但原文件删除失败`,
          llmContent: `Warning: New file created but original deletion failed`,
        }
      }

      return {
        success: true,
        displayText: `✓ 文件已重命名为: ${new_name}`,
        llmContent: `File renamed successfully to ${new_name}`,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        displayText: `❌ 重命名失败: ${error.message}`,
        llmContent: `Error renaming file: ${error.message}`,
      }
    }
  }
}

export class BatchCreateFilesTool extends BaseTool {
  schema: ToolSchema = {
    name: 'batch_create_files',
    description: '批量创建多个文件。当用户需要一次性创建多个文件时使用。',
    parameters: [
      {
        name: 'files',
        type: 'array',
        description: '要创建的文件列表，每项包含 name 和 content',
        required: true,
      },
    ],
    category: 'file_system',
    requiresConfirmation: true,
  }

  validateParams(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!Array.isArray(params.files) || params.files.length === 0) {
      return { valid: false, error: 'files 必须是非空数组' }
    }
    return { valid: true }
  }

  getConfirmationMessage(params: Record<string, any>): string {
    return `确定要批量创建 ${params.files.length} 个文件吗？`
  }

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { files } = params

    if (!window.electronAPI || !context.workspacePath) {
      return {
        success: false,
        error: '工作区未设置',
        displayText: '❌ 请先打开工作区',
        llmContent: 'Error: Workspace not set',
      }
    }

    const results: { name: string; success: boolean; error?: string }[] = []

    for (const file of files) {
      const filePath = await window.electronAPI.path.join(context.workspacePath, file.name)
      const writeResult = await window.electronAPI.writeFile(filePath, file.content || '')
      results.push({
        name: file.name,
        success: writeResult.success,
        error: writeResult.error,
      })
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    if (failCount === 0) {
      return {
        success: true,
        displayText: `✓ 成功创建 ${successCount} 个文件`,
        llmContent: `Successfully created ${successCount} files`,
        data: { results },
      }
    } else {
      return {
        success: true,
        error: `${failCount} 个文件创建失败`,
        displayText: `⚠️ ${successCount} 个文件创建成功，${failCount} 个失败`,
        llmContent: `${successCount} files created, ${failCount} failed`,
        data: { results },
      }
    }
  }
}

export const fileSystemTools = [
  new ReadFileTool(),
  new WriteFileTool(),
  new AppendFileTool(),
  new DeleteFileTool(),
  new ListFilesTool(),
  new SearchContentTool(),
  new MoveFileTool(),
  new RenameFileTool(),
  new BatchCreateFilesTool(),
]
