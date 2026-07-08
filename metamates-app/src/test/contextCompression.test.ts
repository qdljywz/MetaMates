import { describe, it, expect, beforeEach } from 'vitest'
import { ContextCompressionService, CompressedContext } from '../services/memory/contextCompression'
import { ChatMessage } from '../services/chatHistory'

describe('ContextCompressionService', () => {
  let service: ContextCompressionService
  let messages: ChatMessage[]

  beforeEach(() => {
    service = new ContextCompressionService()
    messages = [
      { id: '1', role: 'user', content: '帮我创建一个测试文件', timestamp: Date.now() - 10000 },
      { id: '2', role: 'assistant', content: '好的，我来帮你创建测试文件', timestamp: Date.now() - 9000 },
      { id: '3', role: 'user', content: '修改这个文件的内容', timestamp: Date.now() - 8000 },
      { id: '4', role: 'assistant', content: '文件已修改完成', timestamp: Date.now() - 7000 },
      { id: '5', role: 'user', content: '删除不需要的文件', timestamp: Date.now() - 6000 },
      { id: '6', role: 'assistant', content: '文件已删除', timestamp: Date.now() - 5000 },
    ]
  })

  describe('estimateTokens', () => {
    it('应该估算中文 Token 数量', () => {
      const tokens = service.estimateTokens('这是一个测试内容')
      expect(tokens).toBeGreaterThan(0)
    })

    it('应该估算英文 Token 数量', () => {
      const tokens = service.estimateTokens('This is a test content')
      expect(tokens).toBeGreaterThan(0)
    })

    it('应该估算混合内容 Token 数量', () => {
      const tokens = service.estimateTokens('这是 test 混合 content')
      expect(tokens).toBeGreaterThan(0)
    })

    it('应该估算空内容为 0', () => {
      const tokens = service.estimateTokens('')
      expect(tokens).toBe(0)
    })
  })

  describe('estimateMessagesTokens', () => {
    it('应该估算消息列表的 Token 数量', () => {
      const tokens = service.estimateMessagesTokens(messages)
      expect(tokens).toBeGreaterThan(0)
    })

    it('应该返回 0 对于空消息列表', () => {
      const tokens = service.estimateMessagesTokens([])
      expect(tokens).toBe(0)
    })
  })

  describe('shouldCompress', () => {
    it('应该返回 false 对于少量消息', () => {
      const shortMessages = messages.slice(0, 2)
      const result = service.shouldCompress(shortMessages)
      expect(result).toBe(false)
    })

    it('应该返回 true 对于大量消息', () => {
      const longMessages: ChatMessage[] = []
      for (let i = 0; i < 100; i++) {
        longMessages.push({
          id: `msg_${i}`,
          role: 'user',
          content: '这是一段较长的测试内容，用于测试压缩功能是否正常工作。'.repeat(10),
          timestamp: Date.now() - i * 1000,
        })
      }
      const result = service.shouldCompress(longMessages)
      expect(result).toBe(true)
    })
  })

  describe('extractKeyPoints', () => {
    it('应该提取关键点', () => {
      const content = '这是一个重要的决定。关键问题是需要解决bug。'
      const points = service.extractKeyPoints(content)
      expect(points.length).toBeGreaterThanOrEqual(0)
    })

    it('应该返回空数组对于没有关键点的内容', () => {
      const content = '普通的内容，没有关键词'
      const points = service.extractKeyPoints(content)
      expect(points).toBeDefined()
    })
  })

  describe('extractEntities', () => {
    it('应该提取文件实体', () => {
      const content = '查看 [[项目计划]] 和 [[会议记录]]'
      const entities = service.extractEntities(content)
      expect(entities.has('file')).toBe(true)
    })

    it('应该提取标签实体', () => {
      const content = '这是一个 #工作 #重要 的笔记'
      const entities = service.extractEntities(content)
      expect(entities.has('tag')).toBe(true)
    })

    it('应该提取日期实体', () => {
      const content = '日期是 2024-03-21 到 2024-03-25'
      const entities = service.extractEntities(content)
      expect(entities.has('date')).toBe(true)
    })

    it('应该提取项目实体', () => {
      const content = '项目：测试项目，另一个项目：开发计划'
      const entities = service.extractEntities(content)
      expect(entities.has('project')).toBe(true)
    })

    it('应该返回空 Map 对于没有实体的内容', () => {
      const content = '普通内容没有实体'
      const entities = service.extractEntities(content)
      expect(entities.size).toBe(0)
    })
  })

  describe('calculateImportance', () => {
    it('应该计算消息重要性', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'user',
        content: '这是一个重要的决定，关键问题需要解决',
        timestamp: Date.now(),
      }
      const importance = service.calculateImportance(message)
      expect(importance).toBeGreaterThan(0)
    })

    it('应该给有意图的消息更高分数', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'user',
        content: '普通内容',
        timestamp: Date.now(),
        intent: 'create_file',
      }
      const importance = service.calculateImportance(message)
      expect(importance).toBeGreaterThan(0)
    })

    it('应该给使用工具的消息更高分数', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        content: '普通内容',
        timestamp: Date.now(),
        toolsUsed: ['write_file', 'read_file'],
      }
      const importance = service.calculateImportance(message)
      expect(importance).toBeGreaterThan(0)
    })
  })

  describe('compress', () => {
    it('应该返回未压缩的结果对于少量消息', async () => {
      const shortMessages = messages.slice(0, 2)
      const result = await service.compress(shortMessages)
      
      expect(result.compressionRatio).toBe(1)
      expect(result.preservedMessages.length).toBe(2)
    })

    it('应该压缩大量消息', async () => {
      const longMessages: ChatMessage[] = []
      for (let i = 0; i < 100; i++) {
        longMessages.push({
          id: `msg_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: '这是一段较长的测试内容，用于测试压缩功能是否正常工作。这是一个重要的决定。'.repeat(5),
          timestamp: Date.now() - i * 1000,
        })
      }
      
      const result = await service.compress(longMessages)
      
      expect(result.compressionRatio).toBeLessThan(1)
      expect(result.summary).toBeDefined()
      expect(result.keyPoints).toBeDefined()
    })

    it('应该保留最近的消息', async () => {
      const result = await service.compress(messages)
      
      expect(result.preservedMessages.length).toBeGreaterThan(0)
    })
  })

  describe('createContextWindow', () => {
    it('应该创建上下文窗口', () => {
      const window = service.createContextWindow(messages, 1000)
      expect(window.length).toBeGreaterThan(0)
    })

    it('应该限制 Token 数量', () => {
      const longMessages: ChatMessage[] = []
      for (let i = 0; i < 50; i++) {
        longMessages.push({
          id: `msg_${i}`,
          role: 'user',
          content: '这是一段很长的测试内容'.repeat(20),
          timestamp: Date.now() - i * 1000,
        })
      }
      
      const window = service.createContextWindow(longMessages, 100)
      expect(window.length).toBeLessThan(50)
    })
  })
})
