export type ToolCategory = 'file_system' | 'execution' | 'web' | 'memory' | 'analysis'

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  default?: any
}

export interface ToolSchema {
  name: string
  description: string
  parameters: ToolParameter[]
  category: ToolCategory
  requiresConfirmation: boolean
}

export interface ToolResult {
  success: boolean
  data?: any
  error?: string
  displayText: string
  llmContent: string
}

export interface ToolExecutionContext {
  workspacePath?: string
  currentFile?: string
  fileContents?: { name: string; content: string }[]
  userConfirmation?: (message: string) => Promise<boolean>
}

export abstract class BaseTool {
  abstract schema: ToolSchema
  
  abstract validateParams(params: Record<string, any>): { valid: boolean; error?: string }
  
  abstract execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>
  
  shouldConfirmExecute(_params: Record<string, any>): boolean {
    return this.schema.requiresConfirmation
  }
  
  getConfirmationMessage(_params: Record<string, any>): string {
    return `确认执行工具: ${this.schema.name}?`
  }
}

export interface FunctionCall {
  name: string
  args: Record<string, any>
}

export interface FunctionResponse {
  name: string
  response: {
    success: boolean
    data?: any
    error?: string
  }
}
