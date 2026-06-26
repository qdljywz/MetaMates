export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  intent?: string
  toolsUsed?: string[]
}

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  workspacePath?: string
}

export interface ChatHistoryConfig {
  maxSessions: number
  maxMessagesPerSession: number
  storageKey: string
}

const DEFAULT_CONFIG: ChatHistoryConfig = {
  maxSessions: 50,
  maxMessagesPerSession: 100,
  storageKey: 'metamates_chat_history',
}

export class ChatHistoryService {
  private config: ChatHistoryConfig
  private sessions: Map<string, ChatSession> = new Map()
  private currentSessionId: string | null = null
  
  constructor(config: Partial<ChatHistoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.loadFromStorage()
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey)
      if (stored) {
        const data = JSON.parse(stored)
        this.sessions = new Map(Object.entries(data.sessions || {}))
        this.currentSessionId = data.currentSessionId || null
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        sessions: Object.fromEntries(this.sessions),
        currentSessionId: this.currentSessionId,
      }
      localStorage.setItem(this.config.storageKey, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save chat history:', error)
    }
  }
  
  createSession(name?: string, workspacePath?: string): ChatSession {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const session: ChatSession = {
      id,
      name: name || `对话 ${this.sessions.size + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspacePath,
    }
    
    this.sessions.set(id, session)
    this.currentSessionId = id
    this.pruneOldSessions()
    this.saveToStorage()
    
    return session
  }
  
  getCurrentSession(): ChatSession | null {
    if (!this.currentSessionId) {
      return this.createSession()
    }
    return this.sessions.get(this.currentSessionId) || null
  }
  
  setCurrentSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId
      this.saveToStorage()
      return true
    }
    return false
  }
  
  addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage | null {
    const session = this.getCurrentSession()
    if (!session) return null
    
    const fullMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }
    
    session.messages.push(fullMessage)
    session.updatedAt = Date.now()
    
    if (session.messages.length > this.config.maxMessagesPerSession) {
      session.messages = session.messages.slice(-this.config.maxMessagesPerSession)
    }
    
    this.saveToStorage()
    return fullMessage
  }
  
  getMessages(limit?: number): ChatMessage[] {
    const session = this.getCurrentSession()
    if (!session) return []
    
    if (limit) {
      return session.messages.slice(-limit)
    }
    return [...session.messages]
  }
  
  clearCurrentSession(): void {
    const session = this.getCurrentSession()
    if (session) {
      session.messages = []
      session.updatedAt = Date.now()
      this.saveToStorage()
    }
  }
  
  deleteSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId)
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = this.sessions.size > 0 
          ? Array.from(this.sessions.keys())[0] 
          : null
      }
      this.saveToStorage()
      return true
    }
    return false
  }
  
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
  
  getSession(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null
  }
  
  renameSession(sessionId: string, name: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.name = name
      session.updatedAt = Date.now()
      this.saveToStorage()
      return true
    }
    return false
  }
  
  searchMessages(query: string): { session: ChatSession; message: ChatMessage }[] {
    const results: { session: ChatSession; message: ChatMessage }[] = []
    const lowerQuery = query.toLowerCase()
    
    for (const session of this.sessions.values()) {
      for (const message of session.messages) {
        if (message.content.toLowerCase().includes(lowerQuery)) {
          results.push({ session, message })
        }
      }
    }
    
    return results.sort((a, b) => b.message.timestamp - a.message.timestamp)
  }
  
  getStats(): {
    totalSessions: number
    totalMessages: number
    oldestSession: number | null
    newestSession: number | null
  } {
    let totalMessages = 0
    let oldestSession: number | null = null
    let newestSession: number | null = null
    
    for (const session of this.sessions.values()) {
      totalMessages += session.messages.length
      if (!oldestSession || session.createdAt < oldestSession) {
        oldestSession = session.createdAt
      }
      if (!newestSession || session.createdAt > newestSession) {
        newestSession = session.createdAt
      }
    }
    
    return {
      totalSessions: this.sessions.size,
      totalMessages,
      oldestSession,
      newestSession,
    }
  }
  
  private pruneOldSessions(): void {
    if (this.sessions.size > this.config.maxSessions) {
      const sorted = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      
      const toRemove = sorted.slice(0, this.sessions.size - this.config.maxSessions)
      for (const [id] of toRemove) {
        this.sessions.delete(id)
      }
    }
  }
  
  exportSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    
    return JSON.stringify(session, null, 2)
  }
  
  importSession(data: string): ChatSession | null {
    try {
      const session = JSON.parse(data) as ChatSession
      if (!session.id || !session.messages) return null
      
      session.id = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      this.sessions.set(session.id, session)
      this.saveToStorage()
      return session
    } catch {
      return null
    }
  }
}

export const chatHistoryService = new ChatHistoryService()
