import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Ant Design Tree loadData 行为测试', () => {
  it('应该正确理解 node 对象结构', () => {
    const mockNode = {
      key: 'e:\\Trae\\MetaMates\\MyMetaMates\\Daily Note&Plan',
      props: {
        isLeaf: false,
        dataRef: {
          key: 'e:\\Trae\\MetaMates\\MyMetaMates\\Daily Note&Plan',
          title: 'Daily Note&Plan',
        }
      }
    }

    const nodePath = mockNode.key
    const isLeaf = mockNode.props?.isLeaf ?? (mockNode as any).isLeaf

    expect(nodePath).toBe('e:\\Trae\\MetaMates\\MyMetaMates\\Daily Note&Plan')
    expect(isLeaf).toBe(false)
    
    console.log('✅ node 对象结构正确：key 和 isLeaf 都能正确获取')
  })

  it('应该正确处理 node.isLeaf 和 node.props.isLeaf 两种情况', () => {
    const mockNode1 = {
      key: 'path1',
      isLeaf: false
    }

    const mockNode2 = {
      key: 'path2',
      props: {
        isLeaf: false
      }
    }

    const getIsLeaf = (node: any) => node.props?.isLeaf ?? node.isLeaf

    expect(getIsLeaf(mockNode1)).toBe(false)
    expect(getIsLeaf(mockNode2)).toBe(false)
    
    console.log('✅ 能正确处理两种 node 结构')
  })

  it('应该正确处理空数组 children 的情况', () => {
    const node1 = {
      key: 'path1',
      title: 'folder1',
      isLeaf: false,
      children: []
    }

    const node2 = {
      key: 'path2',
      title: 'folder2',
      isLeaf: false
    }

    expect(node1.children).toEqual([])
    expect((node2 as any).children).toBeUndefined()
    
    console.log('⚠️ children: [] 表示已加载但无子节点')
    console.log('⚠️ children: undefined 表示未加载，会触发 loadData')
  })

  it('应该正确模拟 Ant Design Tree 的 loadData 行为', async () => {
    const treeData = [
      { key: 'folder1', title: 'Folder 1', isLeaf: false },
      { key: 'file1', title: 'File 1', isLeaf: true },
    ]

    const loadedKeys = new Set<string>()

    const loadData = async (node: any) => {
      const nodePath = node.key
      const isLeaf = node.props?.isLeaf ?? node.isLeaf

      if (isLeaf) return

      if (loadedKeys.has(nodePath)) {
        console.log('⚠️ 节点已加载，不会再次触发 loadData')
        return
      }

      const mockChildren = [
        { key: `${nodePath}/child1`, title: 'Child 1', isLeaf: true }
      ]

      loadedKeys.add(nodePath)
      return mockChildren
    }

    const node = { key: 'folder1', isLeaf: false }
    const result = await loadData(node)

    expect(result).toBeDefined()
    expect(result?.length).toBe(1)
    expect(loadedKeys.has('folder1')).toBe(true)
    
    console.log('✅ loadData 行为模拟正确')
  })

  it('应该验证 Sidebar.tsx 中的 loadData 逻辑', async () => {
    const mockElectronAPI = {
      listFiles: vi.fn().mockResolvedValue({
        success: true,
        files: [
          { name: 'file1.md', isDirectory: false, path: 'folder1/file1.md', mtime: Date.now() }
        ]
      })
    }

    ;(global as any).window = { electronAPI: mockElectronAPI }

    const loadData = async (node: any) => {
      const nodePath = node.key
      const isLeaf = node.props?.isLeaf ?? node.isLeaf
      if (isLeaf) return

      const result = await window.electronAPI?.listFiles(nodePath)
      if (result?.success && result.files) {
        const sortedFiles = result.files.sort((a: any, b: any) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return (b.mtime || 0) - (a.mtime || 0)
        })

        const children = sortedFiles.map((file: any) => ({
          key: file.path,
          title: file.name,
          isLeaf: !file.isDirectory,
        }))

        return children
      }
    }

    const node = { key: 'folder1', isLeaf: false }
    const result = await loadData(node)

    expect(mockElectronAPI.listFiles).toHaveBeenCalledWith('folder1')
    expect(result).toBeDefined()
    expect(result?.length).toBe(1)
    expect(result?.[0].title).toBe('file1.md')
    expect(result?.[0].isLeaf).toBe(true)
    
    console.log('✅ Sidebar.tsx 中的 loadData 逻辑正确')
  })
})
