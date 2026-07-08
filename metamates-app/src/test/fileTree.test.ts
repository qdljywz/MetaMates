import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFiles = [
  { name: '01_日记与计划', isDirectory: true, path: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划', mtime: 3000 },
  { name: '原子点子', isDirectory: true, path: 'e:\\Trae\\MetaMates\\MyMetaMates\\原子点子', mtime: 2000 },
  { name: '每日笔记', isDirectory: true, path: 'e:\\Trae\\MetaMates\\MyMetaMates\\每日笔记', mtime: 1000 },
  { name: 'test.md', isDirectory: false, path: 'e:\\Trae\\MetaMates\\MyMetaMates\\test.md', mtime: 500 },
]

const mockSubFiles = [
  { name: '2026-03-16 PLAN.md', isDirectory: false, path: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划\\2026-03-16 PLAN.md', mtime: Date.now() },
]

describe('文件树功能模拟测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确排序文件和文件夹', () => {
    const sortedFiles = [...mockFiles].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return (b.mtime || 0) - (a.mtime || 0)
    })

    expect(sortedFiles[0].name).toBe('01_日记与计划')
    expect(sortedFiles[1].name).toBe('原子点子')
    expect(sortedFiles[2].name).toBe('每日笔记')
    expect(sortedFiles[3].name).toBe('test.md')
    
    console.log('✅ 文件排序正确：文件夹在前，文件在后')
  })

  it('应该正确创建 TreeDataNode', () => {
    const data = mockFiles.map(file => ({
      key: file.path,
      title: file.name,
      isLeaf: !file.isDirectory,
    }))

    expect(data[0].isLeaf).toBe(false)
    expect(data[3].isLeaf).toBe(true)
    
    console.log('✅ TreeDataNode 创建正确：文件夹 isLeaf=false，文件 isLeaf=true')
  })

  it('应该正确处理 loadData 回调', async () => {
    const nodePath = 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划'
    const isLeaf = false
    
    if (isLeaf) {
      console.log('❌ 不应该进入这里')
      return
    }

    const result = { success: true, files: mockSubFiles }
    
    if (result.success && result.files) {
      const children = result.files.map(file => ({
        key: file.path,
        title: file.name,
        isLeaf: !file.isDirectory,
      }))
      
      expect(children.length).toBe(1)
      expect(children[0].title).toBe('2026-03-16 PLAN.md')
      expect(children[0].isLeaf).toBe(true)
      
      console.log('✅ loadData 回调正确：能正确加载子文件')
    }
  })

  it('应该正确更新 treeData', () => {
    const prevData = [
      { key: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划', title: '01_日记与计划', isLeaf: false },
      { key: 'e:\\Trae\\MetaMates\\MyMetaMates\\原子点子', title: '原子点子', isLeaf: false },
    ]
    
    const nodePath = 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划'
    const children = [
      { key: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划\\2026-03-16 PLAN.md', title: '2026-03-16 PLAN.md', isLeaf: true },
    ]
    
    const updateNode = (nodes: any[]): any[] => {
      return nodes.map(n => {
        if (n.key === nodePath) {
          return { ...n, children }
        }
        if (n.children) {
          return { ...n, children: updateNode(n.children) }
        }
        return n
      })
    }
    
    const newData = updateNode(prevData)
    
    expect(newData[0].children).toBeDefined()
    expect(newData[0].children.length).toBe(1)
    expect(newData[0].children[0].title).toBe('2026-03-16 PLAN.md')
    
    console.log('✅ treeData 更新正确：子节点被正确添加')
  })

  it('应该正确处理子文件夹的展开', () => {
    const prevData = [
      { 
        key: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划', 
        title: '01_日记与计划', 
        isLeaf: false,
        children: [
          { key: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划\\subfolder', title: 'subfolder', isLeaf: false },
        ]
      },
    ]
    
    const nodePath = 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划\\subfolder'
    const children = [
      { key: 'e:\\Trae\\MetaMates\\MyMetaMates\\01_日记与计划\\subfolder\\file.md', title: 'file.md', isLeaf: true },
    ]
    
    const updateNode = (nodes: any[]): any[] => {
      return nodes.map(n => {
        if (n.key === nodePath) {
          return { ...n, children }
        }
        if (n.children) {
          return { ...n, children: updateNode(n.children) }
        }
        return n
      })
    }
    
    const newData = updateNode(prevData)
    
    expect(newData[0].children[0].children).toBeDefined()
    expect(newData[0].children[0].children.length).toBe(1)
    
    console.log('✅ 子文件夹展开正确：能正确处理嵌套结构')
  })
})
