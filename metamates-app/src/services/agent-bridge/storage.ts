import type { AgentSettings, AgentConversation, AgentMessage } from './types'

const STORAGE_KEY = 'metamates-agent-storage'
const CONVERSATIONS_KEY = 'metamates-agent-conversations'
const MESSAGES_KEY_PREFIX = 'metamates-agent-messages-'

const DEFAULT_SETTINGS: AgentSettings = {
  defaultBackend: 'gemini',
  defaultModel: 'gemini-2.5-pro',
  autoApprove: false,
  theme: 'dark',
}

class AgentStorageService {
  async getSettings(): Promise<AgentSettings> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS
  }

  async saveSettings(settings: Partial<AgentSettings>): Promise<void> {
    const current = await this.getSettings()
    const updated = { ...current, ...settings }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  async getConversation(id: string): Promise<AgentConversation | null> {
    try {
      const stored = localStorage.getItem(CONVERSATIONS_KEY)
      if (stored) {
        const conversations = JSON.parse(stored) as AgentConversation[]
        return conversations.find(c => c.id === id) || null
      }
    } catch {
      // ignore
    }
    return null
  }

  async saveConversation(conversation: AgentConversation): Promise<void> {
    try {
      const stored = localStorage.getItem(CONVERSATIONS_KEY)
      const conversations: AgentConversation[] = stored ? JSON.parse(stored) : []
      const index = conversations.findIndex(c => c.id === conversation.id)
      if (index >= 0) {
        conversations[index] = conversation
      } else {
        conversations.unshift(conversation)
      }
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
    } catch {
      // ignore
    }
  }

  async getMessages(conversationId: string): Promise<AgentMessage[]> {
    try {
      const stored = localStorage.getItem(`${MESSAGES_KEY_PREFIX}${conversationId}`)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // ignore
    }
    return []
  }

  async addMessage(conversationId: string, message: AgentMessage): Promise<void> {
    try {
      const key = `${MESSAGES_KEY_PREFIX}${conversationId}`
      const stored = localStorage.getItem(key)
      const messages: AgentMessage[] = stored ? JSON.parse(stored) : []
      messages.push(message)
      localStorage.setItem(key, JSON.stringify(messages))
    } catch {
      // ignore
    }
  }

  async clearConversation(conversationId: string): Promise<void> {
    localStorage.removeItem(`${MESSAGES_KEY_PREFIX}${conversationId}`)
    try {
      const stored = localStorage.getItem(CONVERSATIONS_KEY)
      if (stored) {
        const conversations = JSON.parse(stored) as AgentConversation[]
        const filtered = conversations.filter(c => c.id !== conversationId)
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(filtered))
      }
    } catch {
      // ignore
    }
  }
}

export const agentStorage = new AgentStorageService()
