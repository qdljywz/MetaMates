import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('重命名功能测试', () => {
  let contextMenuNode: any = null
  let newName: string = ''
  let renameModalVisible: boolean = false

  const mockElectronAPI = {
    renameFile: vi.fn(),
    path: {
      dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
      join: (...parts: string[]) => parts.join('/'),
      basename: (p: string) => p.split('/').pop() || '',
    },
  }

  const handleRename = async () => {
    if (!contextMenuNode || !mockElectronAPI) return
    
    const oldPath = contextMenuNode.key as string
    const parentDir = mockElectronAPI.path.dirname(oldPath)
    const isDir = !contextMenuNode.isLeaf
    const ext = isDir ? '' : '.md'
    const newPath = mockElectronAPI.path.join(parentDir, newName + ext)
    
    if (oldPath === newPath) {
      renameModalVisible = false
      return
    }
    
    const result = await mockElectronAPI.renameFile(oldPath, newPath)
    
    if (result.success) {
      renameModalVisible = false
      contextMenuNode = null
      return true
    }
    
    return false
  }

  beforeEach(() => {
    vi.clearAllMocks()
    contextMenuNode = null
    newName = ''
    renameModalVisible = false
  })

  it('应该正确重命名文件', async () => {
    contextMenuNode = {
      key: 'e:/workspace/test.md',
      title: 'test.md',
      isLeaf: true,
    }
    newName = 'new-test'
    renameModalVisible = true

    mockElectronAPI.renameFile.mockResolvedValue({ success: true })

    const result = await handleRename()

    expect(mockElectronAPI.renameFile).toHaveBeenCalledWith(
      'e:/workspace/test.md',
      'e:/workspace/new-test.md'
    )
    expect(renameModalVisible).toBe(false)
    expect(contextMenuNode).toBe(null)
    expect(result).toBe(true)
    
    console.log('✅ 文件重命名功能正确')
  })

  it('应该正确重命名文件夹', async () => {
    contextMenuNode = {
      key: 'e:/workspace/myfolder',
      title: 'myfolder',
      isLeaf: false,
    }
    newName = 'new-folder'
    renameModalVisible = true

    mockElectronAPI.renameFile.mockResolvedValue({ success: true })

    const result = await handleRename()

    expect(mockElectronAPI.renameFile).toHaveBeenCalledWith(
      'e:/workspace/myfolder',
      'e:/workspace/new-folder'
    )
    expect(renameModalVisible).toBe(false)
    expect(contextMenuNode).toBe(null)
    expect(result).toBe(true)
    
    console.log('✅ 文件夹重命名功能正确')
  })

  it('应该在路径相同时跳过重命名', async () => {
    contextMenuNode = {
      key: 'e:/workspace/test.md',
      title: 'test.md',
      isLeaf: true,
    }
    newName = 'test'
    renameModalVisible = true

    const result = await handleRename()

    expect(mockElectronAPI.renameFile).not.toHaveBeenCalled()
    expect(renameModalVisible).toBe(false)
    
    console.log('✅ 路径相同时跳过重命名正确')
  })

  it('应该处理重命名失败的情况', async () => {
    contextMenuNode = {
      key: 'e:/workspace/test.md',
      title: 'test.md',
      isLeaf: true,
    }
    newName = 'new-test'
    renameModalVisible = true

    mockElectronAPI.renameFile.mockResolvedValue({ success: false, error: '文件不存在' })

    const result = await handleRename()

    expect(mockElectronAPI.renameFile).toHaveBeenCalled()
    expect(result).toBe(false)
    
    console.log('✅ 重命名失败处理正确')
  })

  it('应该在没有 contextMenuNode 时返回', async () => {
    contextMenuNode = null
    newName = 'new-test'

    const result = await handleRename()

    expect(mockElectronAPI.renameFile).not.toHaveBeenCalled()
    
    console.log('✅ 没有 contextMenuNode 时正确返回')
  })
})
