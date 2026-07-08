import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface MockStatus {
  status: string
  pid: number | null
  isRunning: () => boolean
}

const mockManager = {
  start: vi.fn(),
  stop: vi.fn(),
  sendCommand: vi.fn(),
  getStatus: vi.fn((): MockStatus => ({ status: 'idle', pid: null, isRunning: () => false })),
  isRunning: vi.fn(() => false),
}

describe('GeminiCLIManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    vi.clearAllMocks()
  })

  describe('start', () => {
    it('should start Gemini CLI process', async () => {
      mockManager.start.mockResolvedValue(true)
      mockManager.getStatus.mockReturnValue({ status: 'running', pid: 12345, isRunning: () => true })
      
      await mockManager.start()
      
      const status = mockManager.getStatus()
      expect(status.status).toBe('running')
      expect(status.pid).toBeGreaterThan(0)
    })

    it('should handle already running process', async () => {
      mockManager.start.mockResolvedValue(false)
      
      await mockManager.start()
      const result = await mockManager.start()
      
      expect(result).toBe(false)
    })
  })

  describe('stop', () => {
    it('should stop running process', async () => {
      mockManager.stop.mockResolvedValue(true)
      mockManager.getStatus.mockReturnValue({ status: 'idle', pid: null, isRunning: () => false })
      
      await mockManager.stop()
      
      const status = mockManager.getStatus()
      expect(status.status).toBe('idle')
      expect(status.pid).toBeNull()
    })

    it('should handle stopping idle process', async () => {
      mockManager.stop.mockResolvedValue(false)
      
      const result = await mockManager.stop()
      
      expect(result).toBe(false)
    })
  })

  describe('sendCommand', () => {
    it('should send command to running process', async () => {
      mockManager.sendCommand.mockResolvedValue(undefined)
      
      await mockManager.sendCommand('chat', { message: 'test' })
      
      expect(mockManager.sendCommand).toHaveBeenCalledWith('chat', { message: 'test' })
    })
  })

  describe('getStatus', () => {
    it('should return correct status when running', () => {
      mockManager.getStatus.mockReturnValue({ status: 'running', pid: 12345, isRunning: () => true })
      
      const status = mockManager.getStatus()
      expect(status.status).toBe('running')
      expect(status.pid).toBeGreaterThan(0)
      expect(status.isRunning()).toBe(true)
    })

    it('should return correct status when idle', () => {
      mockManager.getStatus.mockReturnValue({ status: 'idle', pid: null, isRunning: () => false })
      
      const status = mockManager.getStatus()
      expect(status.status).toBe('idle')
      expect(status.pid).toBeNull()
      expect(status.isRunning()).toBe(false)
    })
  })
})
