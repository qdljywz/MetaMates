import { describe, it, expect, beforeEach, vi } from 'vitest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
})

import { agentStorage } from '../storage'

describe('AgentStorage', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('getSettings', () => {
    it('should return default settings when nothing is stored', async () => {
      const settings = await agentStorage.getSettings()
      
      expect(settings.defaultBackend).toBe('gemini')
      expect(settings.defaultModel).toBe('gemini-2.5-pro')
      expect(settings.autoApprove).toBe(false)
      expect(settings.theme).toBe('dark')
    })

    it('should merge stored settings with defaults', async () => {
      localStorageMock.setItem('metamates-agent-storage', JSON.stringify({
        defaultBackend: 'claude',
        autoApprove: true,
      }))
      
      const settings = await agentStorage.getSettings()
      
      expect(settings.defaultBackend).toBe('claude')
      expect(settings.autoApprove).toBe(true)
      expect(settings.defaultModel).toBe('gemini-2.5-pro')
    })
  })

  describe('saveSettings', () => {
    it('should save settings to localStorage', async () => {
      await agentStorage.saveSettings({
        defaultBackend: 'codex',
        theme: 'light',
      })
      
      expect(localStorageMock.setItem).toHaveBeenCalled()
      const savedCall = localStorageMock.setItem.mock.calls.find(
        call => call[0] === 'metamates-agent-storage'
      )
      expect(savedCall).toBeDefined()
      
      const savedData = JSON.parse(savedCall![1])
      expect(savedData.defaultBackend).toBe('codex')
      expect(savedData.theme).toBe('light')
    })
  })

  describe('Conversation management', () => {
    it('should save and retrieve conversations', async () => {
      const conversation = {
        id: 'test-conv-1',
        title: 'Test Conversation',
        backend: 'gemini',
        workspacePath: '/test/path',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      
      await agentStorage.saveConversation(conversation)
      const retrieved = await agentStorage.getConversation('test-conv-1')
      
      expect(retrieved).toEqual(conversation)
    })

    it('should return null for non-existent conversation', async () => {
      const retrieved = await agentStorage.getConversation('non-existent')
      expect(retrieved).toBeNull()
    })

    it('should update existing conversation', async () => {
      const conversation = {
        id: 'test-conv-1',
        title: 'Original Title',
        backend: 'gemini',
        workspacePath: '/test/path',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      
      await agentStorage.saveConversation(conversation)
      
      const updated = {
        ...conversation,
        title: 'Updated Title',
        updatedAt: Date.now(),
      }
      
      await agentStorage.saveConversation(updated)
      const retrieved = await agentStorage.getConversation('test-conv-1')
      
      expect(retrieved?.title).toBe('Updated Title')
    })
  })

  describe('Message management', () => {
    it('should add and retrieve messages', async () => {
      const message = {
        type: 'text' as const,
        conversationId: 'test-conv',
        messageId: 'msg-1',
        content: 'Hello',
        timestamp: Date.now(),
      }
      
      await agentStorage.addMessage('test-conv', message)
      const messages = await agentStorage.getMessages('test-conv')
      
      expect(messages).toHaveLength(1)
      expect(messages[0]).toEqual(message)
    })

    it('should append messages to existing conversation', async () => {
      const msg1 = {
        type: 'text' as const,
        conversationId: 'test-conv',
        messageId: 'msg-1',
        content: 'Hello',
        timestamp: Date.now(),
      }
      const msg2 = {
        type: 'text' as const,
        conversationId: 'test-conv',
        messageId: 'msg-2',
        content: 'World',
        timestamp: Date.now(),
      }
      
      await agentStorage.addMessage('test-conv', msg1)
      await agentStorage.addMessage('test-conv', msg2)
      const messages = await agentStorage.getMessages('test-conv')
      
      expect(messages).toHaveLength(2)
    })

    it('should return empty array for non-existent conversation', async () => {
      const messages = await agentStorage.getMessages('non-existent')
      expect(messages).toEqual([])
    })
  })

  describe('clearConversation', () => {
    it('should remove conversation and its messages', async () => {
      const conversation = {
        id: 'to-delete',
        title: 'To Delete',
        backend: 'gemini',
        workspacePath: '/test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      
      await agentStorage.saveConversation(conversation)
      await agentStorage.addMessage('to-delete', {
        type: 'text',
        conversationId: 'to-delete',
        messageId: 'msg-1',
        content: 'Test',
        timestamp: Date.now(),
      })
      
      await agentStorage.clearConversation('to-delete')
      
      const retrieved = await agentStorage.getConversation('to-delete')
      const messages = await agentStorage.getMessages('to-delete')
      
      expect(retrieved).toBeNull()
      expect(messages).toEqual([])
    })
  })
})
