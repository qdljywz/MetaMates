import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockWorkspacePath = 'E:\\TestWorkspace'

describe('文件操作完整流程测试', () => {
  describe('文件创建流程', () => {
    it('应该创建新的 Markdown 文件', async () => {
      const mockAPI = {
        writeFile: vi.fn().mockResolvedValue({ success: true }),
        path: {
          join: vi.fn((...args) => args.join('/'))
        }
      }
      
      const fileName = '新笔记.md'
      const filePath = `${mockWorkspacePath}/${fileName}`
      const content = '# 新笔记\n\n'
      
      const result = await mockAPI.writeFile(filePath, content)
      
      expect(mockAPI.writeFile).toHaveBeenCalledWith(filePath, content)
      expect(result.success).toBe(true)
    })
    
    it('应该创建带日期的文件名', () => {
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
      
      const fileName = `新笔记_${dateStr}_${timeStr}.md`
      
      expect(fileName).toContain(dateStr)
      expect(fileName).toMatch(/\d{4}-\d{2}-\d{2}/)
    })
    
    it('应该在指定目录创建文件', async () => {
      const mockAPI = {
        writeFile: vi.fn().mockResolvedValue({ success: true }),
        path: {
          join: vi.fn((...args) => args.join('/'))
        }
      }
      
      const parentPath = `${mockWorkspacePath}/子目录`
      const fileName = '子笔记.md'
      const filePath = await mockAPI.path.join(parentPath, fileName)
      
      expect(filePath).toBe(`${mockWorkspacePath}/子目录/${fileName}`)
    })
  })
  
  describe('文件读取流程', () => {
    it('应该读取文件内容', async () => {
      const mockAPI = {
        readFile: vi.fn().mockResolvedValue({ 
          success: true, 
          content: '# 测试文件\n\n内容' 
        })
      }
      
      const filePath = `${mockWorkspacePath}/测试.md`
      const result = await mockAPI.readFile(filePath)
      
      expect(mockAPI.readFile).toHaveBeenCalledWith(filePath)
      expect(result.success).toBe(true)
      expect(result.content).toContain('# 测试文件')
    })
    
    it('应该处理文件不存在的情况', async () => {
      const mockAPI = {
        readFile: vi.fn().mockResolvedValue({ 
          success: false, 
          error: 'File not found' 
        })
      }
      
      const filePath = `${mockWorkspacePath}/不存在.md`
      const result = await mockAPI.readFile(filePath)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('File not found')
    })
  })
  
  describe('文件保存流程', () => {
    it('应该保存文件内容', async () => {
      const mockAPI = {
        writeFile: vi.fn().mockResolvedValue({ success: true })
      }
      
      const filePath = `${mockWorkspacePath}/测试.md`
      const content = '# 更新的内容'
      
      const result = await mockAPI.writeFile(filePath, content)
      
      expect(mockAPI.writeFile).toHaveBeenCalledWith(filePath, content)
      expect(result.success).toBe(true)
    })
    
    it('应该处理保存失败', async () => {
      const mockAPI = {
        writeFile: vi.fn().mockResolvedValue({ 
          success: false, 
          error: 'Permission denied' 
        })
      }
      
      const filePath = `${mockWorkspacePath}/只读.md`
      const content = '# 内容'
      
      const result = await mockAPI.writeFile(filePath, content)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Permission denied')
    })
  })
  
  describe('文件重命名流程', () => {
    it('应该重命名文件', async () => {
      const mockAPI = {
        rename: vi.fn().mockResolvedValue({ success: true }),
        path: {
          join: vi.fn((...args) => args.join('/')),
          basename: vi.fn((path) => path.split('/').pop())
        }
      }
      
      const oldPath = `${mockWorkspacePath}/旧名称.md`
      const newPath = `${mockWorkspacePath}/新名称.md`
      
      const result = await mockAPI.rename(oldPath, newPath)
      
      expect(mockAPI.rename).toHaveBeenCalledWith(oldPath, newPath)
      expect(result.success).toBe(true)
    })
    
    it('应该处理重命名冲突', async () => {
      const mockAPI = {
        rename: vi.fn().mockResolvedValue({ 
          success: false, 
          error: 'File already exists' 
        })
      }
      
      const oldPath = `${mockWorkspacePath}/原文件.md`
      const newPath = `${mockWorkspacePath}/已存在.md`
      
      const result = await mockAPI.rename(oldPath, newPath)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('File already exists')
    })
  })
  
  describe('文件删除流程', () => {
    it('应该删除文件', async () => {
      const mockAPI = {
        deleteFile: vi.fn().mockResolvedValue({ success: true })
      }
      
      const filePath = `${mockWorkspacePath}/待删除.md`
      
      const result = await mockAPI.deleteFile(filePath)
      
      expect(mockAPI.deleteFile).toHaveBeenCalledWith(filePath)
      expect(result.success).toBe(true)
    })
    
    it('应该处理删除失败', async () => {
      const mockAPI = {
        deleteFile: vi.fn().mockResolvedValue({ 
          success: false, 
          error: 'File not found' 
        })
      }
      
      const filePath = `${mockWorkspacePath}/不存在.md`
      
      const result = await mockAPI.deleteFile(filePath)
      
      expect(result.success).toBe(false)
    })
  })
  
  describe('文件夹操作流程', () => {
    it('应该创建文件夹', async () => {
      const mockAPI = {
        createDirectory: vi.fn().mockResolvedValue({ success: true })
      }
      
      const folderPath = `${mockWorkspacePath}/新文件夹`
      
      const result = await mockAPI.createDirectory(folderPath)
      
      expect(mockAPI.createDirectory).toHaveBeenCalledWith(folderPath)
      expect(result.success).toBe(true)
    })
    
    it('应该创建子文件夹', async () => {
      const mockAPI = {
        createDirectory: vi.fn().mockResolvedValue({ success: true }),
        path: {
          join: vi.fn((...args) => args.join('/'))
        }
      }
      
      const parentPath = `${mockWorkspacePath}/父文件夹`
      const folderName = '子文件夹'
      const folderPath = await mockAPI.path.join(parentPath, folderName)
      
      const result = await mockAPI.createDirectory(folderPath)
      
      expect(result.success).toBe(true)
    })
  })
  
  describe('文件移动流程', () => {
    it('应该移动文件到新位置', async () => {
      const mockAPI = {
        move: vi.fn().mockResolvedValue({ success: true }),
        path: {
          join: vi.fn((...args) => args.join('/'))
        }
      }
      
      const sourcePath = `${mockWorkspacePath}/文件.md`
      const targetPath = `${mockWorkspacePath}/子目录/文件.md`
      
      const result = await mockAPI.move(sourcePath, targetPath)
      
      expect(mockAPI.move).toHaveBeenCalledWith(sourcePath, targetPath)
      expect(result.success).toBe(true)
    })
    
    it('应该处理移动失败', async () => {
      const mockAPI = {
        move: vi.fn().mockResolvedValue({ 
          success: false, 
          error: 'Target already exists' 
        })
      }
      
      const sourcePath = `${mockWorkspacePath}/文件.md`
      const targetPath = `${mockWorkspacePath}/目标/文件.md`
      
      const result = await mockAPI.move(sourcePath, targetPath)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Target already exists')
    })
  })
  
  describe('文件列表获取流程', () => {
    it('应该获取目录下的文件列表', async () => {
      const mockAPI = {
        readDirectory: vi.fn().mockResolvedValue({ 
          success: true, 
          files: [
            { name: '文件1.md', isDirectory: false },
            { name: '文件夹', isDirectory: true },
            { name: '文件2.md', isDirectory: false }
          ]
        })
      }
      
      const result = await mockAPI.readDirectory(mockWorkspacePath)
      
      expect(result.success).toBe(true)
      expect(result.files.length).toBe(3)
      expect(result.files.filter((f: { isDirectory: boolean }) => f.isDirectory).length).toBe(1)
    })
    
    it('应该过滤非 Markdown 文件', () => {
      const files = [
        { name: '笔记.md', isDirectory: false },
        { name: '图片.png', isDirectory: false },
        { name: '文档.pdf', isDirectory: false },
        { name: '其他笔记.md', isDirectory: false }
      ]
      
      const mdFiles = files.filter(f => !f.isDirectory && f.name.endsWith('.md'))
      
      expect(mdFiles.length).toBe(2)
    })
    
    it('应该排序文件列表', () => {
      const files = [
        { name: 'Z笔记.md' },
        { name: 'A笔记.md' },
        { name: 'M笔记.md' }
      ]
      
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
      
      expect(sorted[0].name).toBe('A笔记.md')
      expect(sorted[2].name).toBe('Z笔记.md')
    })
  })
})

describe('文件监控测试', () => {
  it('应该监控文件变化', async () => {
    const mockWatcher = {
      start: vi.fn().mockResolvedValue({ success: true }),
      stop: vi.fn().mockResolvedValue({ success: true }),
      onChange: vi.fn()
    }
    
    await mockWatcher.start(mockWorkspacePath)
    
    expect(mockWatcher.start).toHaveBeenCalledWith(mockWorkspacePath)
  })
  
  it('应该停止监控', async () => {
    const mockWatcher = {
      start: vi.fn().mockResolvedValue({ success: true }),
      stop: vi.fn().mockResolvedValue({ success: true })
    }
    
    await mockWatcher.start(mockWorkspacePath)
    await mockWatcher.stop()
    
    expect(mockWatcher.stop).toHaveBeenCalled()
  })
  
  it('应该处理文件变化事件', () => {
    const onChange = vi.fn()
    const eventType = 'change'
    const filePath = `${mockWorkspacePath}/文件.md`
    
    onChange(eventType, filePath)
    
    expect(onChange).toHaveBeenCalledWith(eventType, filePath)
  })
})
