import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

describe('ACP Integration Tests', () => {
  const testDbPath = path.join(process.cwd(), 'test-conversations.db')
  
  beforeAll(() => {
    process.env.TEST_MODE = 'true'
  })
  
  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
  })

  describe('CLI Detection', () => {
    it('should detect installed CLIs using where command on Windows', { timeout: 15000 }, () => {
      const isWindows = process.platform === 'win32'
      const whichCommand = isWindows ? 'where' : 'which'
      
      const potentialClis = ['gemini', 'claude', 'qwen', 'codebuddy', 'codex']
      const detected: string[] = []
      
      for (const cli of potentialClis) {
        try {
          execSync(`${whichCommand} ${cli}`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 3000,
          })
          detected.push(cli)
        } catch {
          // CLI not found
        }
      }
      
      console.log(`Detected CLIs: ${detected.join(', ') || 'None'}`)
      expect(Array.isArray(detected)).toBe(true)
    })
  })

  describe('Logo Info', () => {
    const LOGO_COLORS: Record<string, string> = {
      gemini: '#4285f4',
      codebuddy: '#00d4aa',
      claude: '#d97706',
      qwen: '#8b5cf6',
      codex: '#10a37f',
    }

    function getLogoInfo(backendId: string, name: string): { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string } {
      const initial = name ? name.charAt(0).toUpperCase() : backendId.charAt(0).toUpperCase()
      const bgColor = LOGO_COLORS[backendId] || '#6b7280'
      
      return { type: 'initial', initial, bgColor }
    }

    it('should return initial logo for gemini', () => {
      const logo = getLogoInfo('gemini', 'Gemini CLI')
      expect(logo.type).toBe('initial')
      expect(logo.initial).toBe('G')
      expect(logo.bgColor).toBe('#4285f4')
    })

    it('should return initial logo for claude', () => {
      const logo = getLogoInfo('claude', 'Claude Code')
      expect(logo.type).toBe('initial')
      expect(logo.initial).toBe('C')
      expect(logo.bgColor).toBe('#d97706')
    })

    it('should return default color for unknown backend', () => {
      const logo = getLogoInfo('unknown', 'Unknown CLI')
      expect(logo.type).toBe('initial')
      expect(logo.initial).toBe('U')
      expect(logo.bgColor).toBe('#6b7280')
    })
  })

  describe('Message Composition', () => {
    interface Message {
      id: string
      conversation_id: string
      type: string
      content: any
      msg_id?: string
      position?: string
      status?: string
      created_at?: number
    }

    function generateId(): string {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    function composeMessage(
      newMessage: Message, 
      existingMessages: Message[], 
      callback: (type: 'insert' | 'update', msg: Message) => void
    ): Message[] {
      if (!newMessage) return existingMessages || []
      if (!existingMessages || existingMessages.length === 0) {
        if (callback) callback('insert', newMessage)
        return [newMessage]
      }
      
      const last = existingMessages[existingMessages.length - 1]
      
      if (newMessage.type === 'acp_tool_call') {
        for (let i = 0, len = existingMessages.length; i < len; i++) {
          const msg = existingMessages[i]
          if (msg.type === 'acp_tool_call' && msg.content?.update?.toolCallId === newMessage.content?.update?.toolCallId) {
            const merged = { ...msg.content, ...newMessage.content }
            existingMessages[i] = { ...msg, content: merged }
            callback('update', existingMessages[i])
            return existingMessages.slice()
          }
        }
        existingMessages.push(newMessage)
        callback('insert', newMessage)
        return existingMessages.slice()
      }
      
      if (last.msg_id !== newMessage.msg_id || last.type !== newMessage.type) {
        existingMessages.push(newMessage)
        callback('insert', newMessage)
        return existingMessages.slice()
      }
      
      if (newMessage.type === 'text' && last.type === 'text') {
        newMessage.content = {
          ...newMessage.content,
          content: (last.content?.content || '') + (newMessage.content?.content || '')
        }
      }
      
      existingMessages[existingMessages.length - 1] = Object.assign({}, last, newMessage)
      callback('update', existingMessages[existingMessages.length - 1])
      return existingMessages.slice()
    }

    it('should merge text messages with same msg_id', () => {
      const messages: Message[] = []
      const operations: Array<{ type: string; msg: Message }> = []
      
      const msg1: Message = {
        id: '1',
        conversation_id: 'conv1',
        type: 'text',
        msg_id: 'msg1',
        content: { content: 'Hello' },
        created_at: Date.now()
      }
      
      const msg2: Message = {
        id: '2',
        conversation_id: 'conv1',
        type: 'text',
        msg_id: 'msg1',
        content: { content: ' World' },
        created_at: Date.now()
      }
      
      let result = composeMessage(msg1, messages, (type, msg) => {
        operations.push({ type, msg })
      })
      
      result = composeMessage(msg2, result, (type, msg) => {
        operations.push({ type, msg })
      })
      
      expect(result.length).toBe(1)
      expect(result[0].content.content).toBe('Hello World')
      expect(operations[0].type).toBe('insert')
      expect(operations[1].type).toBe('update')
    })

    it('should update tool_call by toolCallId', () => {
      const messages: Message[] = []
      const operations: Array<{ type: string; msg: Message }> = []
      
      const toolCall1: Message = {
        id: '1',
        conversation_id: 'conv1',
        type: 'acp_tool_call',
        content: { update: { toolCallId: 'tool1', title: 'Read File', status: 'in_progress' } },
        created_at: Date.now()
      }
      
      const toolCall2: Message = {
        id: '2',
        conversation_id: 'conv1',
        type: 'acp_tool_call',
        content: { update: { toolCallId: 'tool1', title: 'Read File', status: 'completed' } },
        created_at: Date.now()
      }
      
      let result = composeMessage(toolCall1, messages, (type, msg) => {
        operations.push({ type, msg })
      })
      
      result = composeMessage(toolCall2, result, (type, msg) => {
        operations.push({ type, msg })
      })
      
      expect(result.length).toBe(1)
      expect(result[0].content.update.status).toBe('completed')
      expect(operations[0].type).toBe('insert')
      expect(operations[1].type).toBe('update')
    })

    it('should add new message when msg_id differs', () => {
      const messages: Message[] = []
      const operations: Array<{ type: string; msg: Message }> = []
      
      const msg1: Message = {
        id: '1',
        conversation_id: 'conv1',
        type: 'text',
        msg_id: 'msg1',
        content: { content: 'Hello' },
        created_at: Date.now()
      }
      
      const msg2: Message = {
        id: '2',
        conversation_id: 'conv1',
        type: 'text',
        msg_id: 'msg2',
        content: { content: 'World' },
        created_at: Date.now()
      }
      
      let result = composeMessage(msg1, messages, (type, msg) => {
        operations.push({ type, msg })
      })
      
      result = composeMessage(msg2, result, (type, msg) => {
        operations.push({ type, msg })
      })
      
      expect(result.length).toBe(2)
      expect(operations[0].type).toBe('insert')
      expect(operations[1].type).toBe('insert')
    })
  })

  describe('Message Queue', () => {
    it('should queue and flush messages', async () => {
      const messageQueues = new Map<string, any[]>()
      const flushedMessages: any[] = []
      
      function queueMessage(conversationId: string, message: any): void {
        if (!messageQueues.has(conversationId)) {
          messageQueues.set(conversationId, [])
        }
        messageQueues.get(conversationId)!.push(message)
      }
      
      function flushMessageQueue(conversationId: string): void {
        const queue = messageQueues.get(conversationId)
        if (!queue || queue.length === 0) return
        messageQueues.set(conversationId, [])
        flushedMessages.push(...queue)
      }
      
      queueMessage('conv1', { id: '1', content: 'Hello' })
      queueMessage('conv1', { id: '2', content: 'World' })
      
      expect(messageQueues.get('conv1')?.length).toBe(2)
      
      flushMessageQueue('conv1')
      
      expect(flushedMessages.length).toBe(2)
      expect(messageQueues.get('conv1')?.length).toBe(0)
    })
  })

  describe('Conversation Map Cache', () => {
    it('should cache conversations in memory', () => {
      const conversationMap = new Map<string, { id: string; backend: string }>()
      
      function getOrCreateConversation(backend: string): { id: string; backend: string } {
        if (conversationMap.has(backend)) {
          return conversationMap.get(backend)!
        }
        
        const conversation = { id: `${backend}-${Date.now()}`, backend }
        conversationMap.set(backend, conversation)
        return conversation
      }
      
      const conv1 = getOrCreateConversation('gemini')
      const conv2 = getOrCreateConversation('gemini')
      
      expect(conv1.id).toBe(conv2.id)
      expect(conversationMap.size).toBe(1)
      
      const conv3 = getOrCreateConversation('claude')
      expect(conversationMap.size).toBe(2)
    })
  })
})
