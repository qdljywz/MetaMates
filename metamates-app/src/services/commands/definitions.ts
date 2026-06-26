export interface Command {
  name: string
  description: string
  category: 'daily' | 'thinking' | 'ideas' | 'planning'
  args?: string
}

export interface CommandContext {
  userMessage: string
  fileContents: Array<{ name: string; content: string }>
  workspacePath: string
  settings: any
}

export interface CommandResult {
  success: boolean
  content?: string
  error?: string
}
