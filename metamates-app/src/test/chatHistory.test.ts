import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ChatHistoryService, ChatSession, ChatMessage } from '../services/chatHistory'

const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage })

describe('ChatHistoryService', () => {
  let service: ChatHistoryService

  beforeEach(() => {
    mockLocalStorage.clear()
    vi.clearAllMocks()
    service = new ChatHistoryService()
  })

  describe('createSession', () => {
    it('应该创建新会话', () => {
      const session = service.createSession()
      
      expect(session.id).toBeDefined()
      expect(session.name).toBeDefined()
      expect(session.messages.length).toBe(0)
      expect(session.createdAt).toBeGreaterThan(0)
    })

    it('应该使用自定义名称', () => {
      const session = service.createSession('测试会话')
      
      expect(session.name).toBe('测试会话')
    })

    it('应该设置工作区路径', () => {
      const session = service.createSession('测试', '/workspace')
      
      expect(session.workspacePath).toBe('/workspace')
    })

    it('应该设置为新当前会话', () => {
      service.createSession('会话1')
      service.createSession('会话2')
      
      const current = service.getCurrentSession()
      expect(current?.name).toBe('会话2')
    })
  })

  describe('getCurrentSession', () => {
    it('应该返回当前会话', () => {
      service.createSession('测试会话')
      
      const session = service.getCurrentSession()
      expect(session?.name).toBe('测试会话')
    })

    it('应该自动创建会话如果没有当前会话', () => {
      const session = service.getCurrentSession()
      
      expect(session).not.toBeNull()
      expect(session?.id).toBeDefined()
    })
  })

  describe('setCurrentSession', () => {
    it('应该切换当前会话', () => {
      const session1 = service.createSession('会话1')
      const session2 = service.createSession('会话2')
      
      const result = service.setCurrentSession(session1.id)
      
      expect(result).toBe(true)
      expect(service.getCurrentSession()?.id).toBe(session1.id)
    })

    it('应该返回 false 如果会话不存在', () => {
      const result = service.setCurrentSession('nonexistent')
      
      expect(result).toBe(false)
    })
  })

  describe('addMessage', () => {
    it('应该添加消息到当前会话', () => {
      service.createSession('测试')
      
      const message = service.addMessage({
        role: 'user',
        content: '你好',
      })
      
      expect(message).not.toBeNull()
      expect(message?.content).toBe('你好')
      expect(message?.role).toBe('user')
      expect(message?.id).toBeDefined()
      expect(message?.timestamp).toBeGreaterThan(0)
    })

    it('应该自动创建会话如果没有当前会话', () => {
      const newService = new ChatHistoryService({ storageKey: 'test_key_auto' })
      const session = newService.getCurrentSession()
      
      expect(session).not.toBeNull()
      expect(session?.id).toBeDefined()
    })

    it('应该限制消息数量', () => {
      const limitedService = new ChatHistoryService({ 
        maxMessagesPerSession: 5,
        storageKey: 'limited_test',
      })
      limitedService.createSession('测试')
      
      for (let i = 0; i < 10; i++) {
        limitedService.addMessage({
          role: 'user',
          content: `消息 ${i}`,
        })
      }
      
      const messages = limitedService.getMessages()
      expect(messages.length).toBe(5)
    })
  })

  describe('getMessages', () => {
    it('应该返回所有消息', () => {
      service.createSession('测试')
      service.addMessage({ role: 'user', content: '消息1' })
      service.addMessage({ role: 'assistant', content: '消息2' })
      
      const messages = service.getMessages()
      
      expect(messages.length).toBe(2)
    })

    it('应该限制返回数量', () => {
      service.createSession('测试')
      for (let i = 0; i < 10; i++) {
        service.addMessage({ role: 'user', content: `消息${i}` })
      }
      
      const messages = service.getMessages(5)
      
      expect(messages.length).toBe(5)
    })

    it('应该返回最新的消息', () => {
      service.createSession('测试')
      service.addMessage({ role: 'user', content: '消息1' })
      service.addMessage({ role: 'user', content: '消息2' })
      service.addMessage({ role: 'user', content: '消息3' })
      
      const messages = service.getMessages(2)
      
      expect(messages[0].content).toBe('消息2')
      expect(messages[1].content).toBe('消息3')
    })
  })

  describe('clearCurrentSession', () => {
    it('应该清空当前会话的消息', () => {
      service.createSession('测试')
      service.addMessage({ role: 'user', content: '消息' })
      
      service.clearCurrentSession()
      
      const messages = service.getMessages()
      expect(messages.length).toBe(0)
    })
  })

  describe('deleteSession', () => {
    it('应该删除会话', () => {
      const session = service.createSession('测试')
      
      const result = service.deleteSession(session.id)
      
      expect(result).toBe(true)
      expect(service.getSession(session.id)).toBeNull()
    })

    it('应该切换当前会话如果删除的是当前会话', () => {
      const session1 = service.createSession('会话1')
      const session2 = service.createSession('会话2')
      
      service.deleteSession(session2.id)
      
      expect(service.getCurrentSession()?.id).toBe(session1.id)
    })

    it('应该返回 false 如果会话不存在', () => {
      const result = service.deleteSession('nonexistent')
      
      expect(result).toBe(false)
    })
  })

  describe('getAllSessions', () => {
    it('应该返回所有会话', () => {
      service.createSession('会话1')
      service.createSession('会话2')
      service.createSession('会话3')
      
      const sessions = service.getAllSessions()
      
      expect(sessions.length).toBe(3)
    })

    it('应该按更新时间排序', async () => {
      service.createSession('会话1')
      await new Promise(r => setTimeout(r, 10))
      service.createSession('会话2')
      await new Promise(r => setTimeout(r, 10))
      service.createSession('会话3')
      
      const sessions = service.getAllSessions()
      
      expect(sessions[0].name).toBe('会话3')
      expect(sessions[2].name).toBe('会话1')
    })
  })

  describe('getSession', () => {
    it('应该返回指定会话', () => {
      const session = service.createSession('测试')
      
      const result = service.getSession(session.id)
      
      expect(result?.id).toBe(session.id)
    })

    it('应该返回 null 如果会话不存在', () => {
      const result = service.getSession('nonexistent')
      
      expect(result).toBeNull()
    })
  })

  describe('renameSession', () => {
    it('应该重命名会话', () => {
      const session = service.createSession('旧名称')
      
      const result = service.renameSession(session.id, '新名称')
      
      expect(result).toBe(true)
      expect(service.getSession(session.id)?.name).toBe('新名称')
    })

    it('应该返回 false 如果会话不存在', () => {
      const result = service.renameSession('nonexistent', '新名称')
      
      expect(result).toBe(false)
    })
  })

  describe('searchMessages', () => {
    it('应该搜索消息', () => {
      service.createSession('测试')
      service.addMessage({ role: 'user', content: '创建一个测试文件' })
      service.addMessage({ role: 'assistant', content: '好的，已创建' })
      service.addMessage({ role: 'user', content: '修改配置' })
      
      const results = service.searchMessages('测试')
      
      expect(results.length).toBe(1)
      expect(results[0].message.content).toContain('测试')
    })

    it('应该忽略大小写', () => {
      service.createSession('测试')
      service.addMessage({ role: 'user', content: 'Hello World' })
      
      const results = service.searchMessages('hello')
      
      expect(results.length).toBe(1)
    })

    it('应该返回空数组如果没有匹配', () => {
      service.createSession('测试')
      service.addMessage({ role: 'user', content: '测试消息' })
      
      const results = service.searchMessages('不存在的关键词')
      
      expect(results.length).toBe(0)
    })
  })

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      service.createSession('会话1')
      service.addMessage({ role: 'user', content: '消息1' })
      service.addMessage({ role: 'assistant', content: '消息2' })
      service.createSession('会话2')
      service.addMessage({ role: 'user', content: '消息3' })
      
      const stats = service.getStats()
      
      expect(stats.totalSessions).toBe(2)
      expect(stats.totalMessages).toBe(3)
      expect(stats.oldestSession).toBeGreaterThan(0)
      expect(stats.newestSession).toBeGreaterThan(0)
    })

    it('应该返回空统计如果没有会话', () => {
      const stats = service.getStats()
      
      expect(stats.totalSessions).toBe(0)
      expect(stats.totalMessages).toBe(0)
      expect(stats.oldestSession).toBeNull()
      expect(stats.newestSession).toBeNull()
    })
  })

  describe('exportSession', () => {
    it('应该导出会话', () => {
      const session = service.createSession('测试')
      service.addMessage({ role: 'user', content: '消息' })
      
      const exported = service.exportSession(session.id)
      
      expect(exported).not.toBeNull()
      const parsed = JSON.parse(exported!)
      expect(parsed.name).toBe('测试')
    })

    it('应该返回 null 如果会话不存在', () => {
      const exported = service.exportSession('nonexistent')
      
      expect(exported).toBeNull()
    })
  })

  describe('importSession', () => {
    it('应该导入会话', () => {
      const sessionData = JSON.stringify({
        id: 'original_id',
        name: '导入的会话',
        messages: [
          { id: 'msg1', role: 'user', content: '测试', timestamp: Date.now() }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      
      const imported = service.importSession(sessionData)
      
      expect(imported).not.toBeNull()
      expect(imported?.name).toBe('导入的会话')
      expect(imported?.id).not.toBe('original_id')
    })

    it('应该返回 null 如果数据无效', () => {
      const result = service.importSession('invalid json')
      
      expect(result).toBeNull()
    })

    it('应该返回 null 如果缺少必要字段', () => {
      const result = service.importSession(JSON.stringify({ name: '测试' }))
      
      expect(result).toBeNull()
    })
  })
})
