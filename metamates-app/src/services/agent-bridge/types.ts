export interface AgentMessage {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'status' | 'confirmation'
  conversationId: string
  messageId: string
  content?: string
  data?: unknown
  timestamp: number
}

export interface ConfirmationRequest {
  id: string
  title: string
  description: string
  options: ConfirmationOption[]
}

export interface ConfirmationOption {
  id: string
  label: string
  value: string
}

export interface AgentInfo {
  id: string
  name: string
  backend: string
  cliPath?: string
  available: boolean
  isBuiltIn?: boolean
}

export interface AgentConfig {
  workspacePath: string
  backend: string
  cliPath?: string
  modelId?: string
  sessionMode?: string
}

export interface IAgentBridge {
  sendMessage(conversationId: string, content: string): Promise<void>
  onMessage(callback: (msg: AgentMessage) => void): () => void
  onConfirmation(callback: (req: ConfirmationRequest) => void): () => void
  confirm(requestId: string, optionId: string): Promise<void>
  stop(conversationId: string): Promise<void>
  getAvailableAgents(): Promise<AgentInfo[]>
  startAgent(config: AgentConfig): Promise<void>
  killAgent(conversationId: string): Promise<void>
}

export interface IAgentStorage {
  getConversation(id: string): Promise<AgentConversation | null>
  saveConversation(conversation: AgentConversation): Promise<void>
  getMessages(conversationId: string): Promise<AgentMessage[]>
  addMessage(conversationId: string, message: AgentMessage): Promise<void>
  getSettings(): Promise<AgentSettings>
  saveSettings(settings: Partial<AgentSettings>): Promise<void>
}

export interface AgentConversation {
  id: string
  title: string
  backend: string
  workspacePath: string
  createdAt: number
  updatedAt: number
  messages?: AgentMessage[]
  extra?: Record<string, unknown>
}

export interface AgentSettings {
  defaultBackend: string
  defaultModel: string
  autoApprove: boolean
  theme: 'dark' | 'light' | 'system'
}
