import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Layout, Tree, Button, Divider, message, Badge, Modal, Input, Dropdown } from 'antd'
import { useTranslation } from 'react-i18next'
import { 
  FolderOutlined, 
  FileOutlined, 
  FolderAddOutlined, 
  FileAddOutlined,
  FileTextOutlined,
  SyncOutlined,
  ApartmentOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import type { TreeDataNode, TreeProps, MenuProps } from 'antd'
import { useAppContext } from '../store/AppContext'
import TemplateSelector from '../templates/TemplateSelector'
import { Template } from '../templates/definitions'
import type { FileChangeEvent } from '../types/electron'
import { storageService } from '../services/storage'
import GraphView from './GraphView'
import { useTheme } from '../hooks/useTheme'

const { Sider } = Layout

const Sidebar: React.FC = () => {
  const { t } = useTranslation('sidebar')
  const { state, dispatch } = useAppContext()
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const [treeData, setTreeData] = useState<TreeDataNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([])
  const [templateVisible, setTemplateVisible] = useState(false)
  const [isWatching, setIsWatching] = useState(false)
  const [lastChange, setLastChange] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(false)
  const contextMenuNodeRef = useRef<TreeDataNode | null>(null)
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [renameModalVisible, setRenameModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)

  const loadFiles = useCallback(async (dirPath: string, clearChildren: boolean = false) => {
    if (!window.electronAPI) {
      return
    }
    const result = await window.electronAPI.listFiles(dirPath)
    if (result.success && result.files) {
      const sortedFiles = result.files.sort((a: any, b: any) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return (b.mtime || 0) - (a.mtime || 0)
      })
      
      if (clearChildren) {
        setLoadedKeys([])
      }
      
      setTreeData(prevData => {
        if (clearChildren) {
          const data: TreeDataNode[] = sortedFiles.map((file: { name: string; path: string; isDirectory: boolean }) => ({
            key: file.path,
            title: file.name,
            isLeaf: !file.isDirectory,
            icon: file.isDirectory ? <FolderOutlined /> : <FileOutlined />,
          }))
          return data
        }

        const prevDataMap = new Map<string, TreeDataNode>()
        const collectNodes = (nodes: TreeDataNode[]) => {
          for (const node of nodes) {
            if (node.children) {
              prevDataMap.set(node.key as string, node)
              collectNodes(node.children)
            }
          }
        }
        collectNodes(prevData)

        const data: TreeDataNode[] = sortedFiles.map((file: { name: string; path: string; isDirectory: boolean }) => {
          const existingNode = prevDataMap.get(file.path)
          return {
            key: file.path,
            title: file.name,
            isLeaf: !file.isDirectory,
            icon: file.isDirectory ? <FolderOutlined /> : <FileOutlined />,
            children: existingNode?.children,
          }
        })
        return data
      })
    }
  }, [])

  const handleFileChange = useCallback((data: FileChangeEvent) => {
    console.log('File changed:', data)
    setLastChange(`${data.type}: ${data.filename}`)
    
    if (state.workspacePath) {
      loadFiles(state.workspacePath)
    }
  }, [state.workspacePath, loadFiles])

  const startWatching = useCallback(async (dirPath: string) => {
    if (!window.electronAPI) return
    
    const result = await window.electronAPI.watchDirectory(dirPath)
    if (result.success) {
      setIsWatching(true)
      window.electronAPI.onFileChanged(handleFileChange)
      window.electronAPI.onWatchError((error: string) => {
        message.error(t('messages.fileMonitorError') + ': ' + error)
        setIsWatching(false)
      })
    }
  }, [handleFileChange])

  const stopWatching = useCallback(async () => {
    if (!window.electronAPI) return
    
    await window.electronAPI.unwatchDirectory()
    window.electronAPI.removeFileChangedListener()
    window.electronAPI.removeWatchErrorListener()
    setIsWatching(false)
  }, [])

  useEffect(() => {
    return () => {
      stopWatching()
    }
  }, [stopWatching])

  const selectWorkspace = async () => {
    if (!window.electronAPI) {
      alert(t('electronOnly'))
      return
    }
    
    if (isWatching) {
      await stopWatching()
    }
    
    const result = await window.electronAPI.selectDirectory()
    if (!result.canceled && result.filePaths.length > 0) {
      const path = result.filePaths[0]
      dispatch({ type: 'SET_WORKSPACE', payload: path })
      loadFiles(path)
      startWatching(path)
      storageService.saveSettings({ workspacePath: path }).catch(console.error)
      window.electronAPI?.saveSettings({ workspacePath: path }).catch(console.error)
    }
  }

  const onSelect: TreeProps['onSelect'] = (selectedKeys, info) => {
    if (selectedKeys.length > 0) {
      const path = selectedKeys[0] as string
      const node = info.node as TreeDataNode
      const isFolder = node.isLeaf === false
      
      if (!isFolder) {
        const fileName = (node.title as string) || path.split(/[/\\]/).pop() || path
        dispatch({ 
          type: 'ADD_TAB', 
          payload: { path, name: fileName, isDirty: false }
        })
      }
    }
  }

  const handleTemplateSelect = async (content: string, template: Template, fixedFileName?: string) => {
    console.log('Selected template:', template.name)
    console.log('Content:', content)
    console.log('FixedFileName:', fixedFileName)
    
    if (!window.electronAPI) {
      alert(t('electronOnly'))
      return
    }
    
    if (!state.workspacePath) {
      alert(t('pleaseOpenWorkspaceFirst'))
      return
    }
    
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    let filePath: string
    let fileName: string
    
    if (fixedFileName) {
      const nameWithoutExt = fixedFileName.replace('.md', '')
      fileName = `${dateStr} ${nameWithoutExt}.md`
      filePath = await window.electronAPI.path.join(state.workspacePath, fileName)
      
      const existsResult = await window.electronAPI.fileExists(filePath)
      if (existsResult.exists) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
        message.info(`已打开 ${fileName}`)
        return
      }
    } else {
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
      fileName = `${template.name}_${dateStr}_${timeStr}.md`
      filePath = await window.electronAPI.path.join(state.workspacePath, fileName)
    }
    
    const result = await window.electronAPI.writeFile(filePath, content)
    
    if (result.success) {
      loadFiles(state.workspacePath)
      dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
      message.success(`${t('created')} ${fileName}`)
    } else {
      message.error(t('messages.createFileFailed') + ': ' + result.error)
    }
  }

  const createNewNote = async () => {
    if (!window.electronAPI) {
      alert(t('electronOnly'))
      return
    }
    if (!state.workspacePath) {
      return
    }
    
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
    const fileName = `${t('newNote')}_${dateStr}_${timeStr}.md`
    const filePath = await window.electronAPI.path.join(state.workspacePath, fileName)
    const result = await window.electronAPI.writeFile(filePath, t('newNoteContent'))
    if (result.success) {
      loadFiles(state.workspacePath)
      dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
    }
  }

  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const createNewFolder = async () => {
    if (!window.electronAPI) {
      alert(t('electronOnly'))
      return
    }
    if (!state.workspacePath) {
      return
    }
    
    if (!newFolderName.trim()) {
      message.error(t('pleaseEnterFolderName'))
      return
    }
    
    const folderPath = await window.electronAPI.path.join(state.workspacePath, newFolderName.trim())
    
    try {
      const result = await window.electronAPI.createDirectory(folderPath)
      if (result.success) {
        loadFiles(state.workspacePath)
        message.success(`${t('created')}: ${newFolderName}`)
        setNewFolderName('')
        setShowNewFolderModal(false)
      } else {
        message.error(t('messages.createFolderFailed') + ': ' + result.error)
      }
    } catch (error: any) {
      message.error(t('messages.createFolderFailed') + ': ' + error.message)
    }
  }

  const refreshFiles = async () => {
    if (state.workspacePath) {
      loadFiles(state.workspacePath)
      message.success(t('fileListRefreshed'))
    }
  }

  const handleDrop = async (info: any) => {
    console.log('=== DROP EVENT ===')
    console.log('Full info:', info)
    console.log('Info keys:', Object.keys(info))
    console.log('Drag node:', info.dragNode)
    console.log('Drag node type:', typeof info.dragNode)
    console.log('Drag node props:', info.dragNode?.props)
    console.log('Drag node data:', info.dragNode?.data)
    console.log('Drag node id:', info.dragNode?.id)
    console.log('Drag node pos:', info.dragNode?.pos)
    console.log('Drag nodes keys:', info.dragNodesKeys)
    console.log('Drop node:', info.node)
    console.log('Drop to gap:', info.dropToGap)
    console.log('==================')
    
    if (!window.electronAPI || !state.workspacePath) {
      console.log('No electronAPI or workspacePath')
      return
    }
    
    const dropNode = info.node
    
    if (!dropNode) {
      console.log('Missing drop node')
      return
    }
    
    const dropPath = dropNode.key
    
    let dragPath: string | undefined
    
    if (info.dragNode?.key) {
      dragPath = info.dragNode.key as string
      console.log('Got dragPath from dragNode.key:', dragPath)
    } else if (info.dragNodesKeys && info.dragNodesKeys.length > 0) {
      dragPath = info.dragNodesKeys[0] as string
      console.log('Got dragPath from dragNodesKeys[0]:', dragPath)
    } else {
      console.log('Could not get dragPath')
    }
    
    console.log('Final Drag path:', dragPath)
    console.log('Final Drop path:', dropPath)
    
    if (!dragPath || !dropPath) {
      console.log('Missing paths - aborting')
      return
    }
    
    const isDropToFolder = dropNode.isLeaf === false
    
    console.log('Is drop to folder:', isDropToFolder)
    
    let targetPath: string
    
    if (isDropToFolder && info.dropToGap === false) {
      const baseName = await window.electronAPI.path.basename(dragPath)
      targetPath = await window.electronAPI.path.join(dropPath, baseName)
      console.log('Moving into folder:', targetPath)
    } else {
      const dropDir = await window.electronAPI.path.dirname(dropPath)
      const baseName = await window.electronAPI.path.basename(dragPath)
      targetPath = await window.electronAPI.path.join(dropDir, baseName)
      console.log('Moving to same level:', targetPath)
    }
    
    if (dragPath === targetPath) {
      console.log('Same path, skipping')
      return
    }
    
    console.log(`Moving: ${dragPath} -> ${targetPath}`)
    
    try {
      const result = await window.electronAPI.renameFile(dragPath, targetPath)
      console.log('Rename result:', result)
      
      if (result.success) {
        const baseName = await window.electronAPI.path.basename(dragPath)
        message.success(t('messages.moveSuccess', { name: baseName }))
        await loadFiles(state.workspacePath, true)
        
        if (state.currentFile === dragPath) {
          dispatch({ type: 'SET_CURRENT_FILE', payload: targetPath })
        }
      } else {
        message.error(t('messages.moveFailed') + ': ' + result.error)
      }
    } catch (error: any) {
      console.error('Move error:', error)
      message.error(t('messages.moveFailed') + ': ' + error.message)
    }
  }

  const handleContextMenu = (node: TreeDataNode, e: React.MouseEvent) => {
    e.preventDefault()
    contextMenuNodeRef.current = node
    setContextMenuVisible(true)
  }

  const handleRename = async () => {
    console.log('handleRename called')
    console.log('contextMenuNodeRef.current:', contextMenuNodeRef.current)
    console.log('window.electronAPI:', window.electronAPI)
    console.log('newName:', newName)
    
    if (!contextMenuNodeRef.current || !window.electronAPI) {
      console.log('Early return: missing contextMenuNode or electronAPI')
      return
    }
    
    const oldPath = contextMenuNodeRef.current.key as string
    const parentDir = await window.electronAPI.path.dirname(oldPath)
    const isDir = !contextMenuNodeRef.current.isLeaf
    const ext = isDir ? '' : '.md'
    const newPath = await window.electronAPI.path.join(parentDir, newName + ext)
    
    console.log('oldPath:', oldPath)
    console.log('newPath:', newPath)
    
    if (oldPath === newPath) {
      console.log('Same path, closing modal')
      setRenameModalVisible(false)
      return
    }
    
    const result = await window.electronAPI.renameFile(oldPath, newPath)
    console.log('renameFile result:', result)
    
    if (result.success) {
      message.success(t('messages.renameSuccess'))
      await loadFiles(state.workspacePath, true)
      if (state.currentFile === oldPath) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: newPath })
      }
    } else {
      message.error(t('messages.renameFailed') + ': ' + result.error)
    }
    setRenameModalVisible(false)
    contextMenuNodeRef.current = null
  }

  const handleDelete = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI) return
    
    const filePath = contextMenuNodeRef.current.key as string
    const result = await window.electronAPI.deleteFile(filePath)
    
    if (result.success) {
      message.success(t('messages.deleteSuccess'))
      await loadFiles(state.workspacePath, true)
      if (state.currentFile === filePath) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: null })
      }
    } else {
      message.error(t('messages.deleteFailed') + ': ' + result.error)
    }
    
    setDeleteModalVisible(false)
    contextMenuNodeRef.current = null
  }

  const handleCopyPath = () => {
    if (!contextMenuNodeRef.current) return
    navigator.clipboard.writeText(contextMenuNodeRef.current.key as string)
    message.success(t('messages.copySuccess'))
    contextMenuNodeRef.current = null
  }

  const handleOpenInExplorer = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI) return
    const filePath = contextMenuNodeRef.current.key as string
    await window.electronAPI.openInExplorer(filePath)
    contextMenuNodeRef.current = null
  }

  const handleCreateSubfolder = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI || !state.workspacePath) return
    
    const parentPath = contextMenuNodeRef.current.key as string
    const folderName = t('newFolderName')
    const folderPath = await window.electronAPI.path.join(parentPath, folderName)
    
    const result = await window.electronAPI.createDirectory(folderPath)
    
    if (result.success) {
      message.success(t('createdSubfolder'))
      await loadFiles(state.workspacePath, true)
    } else {
      message.error(t('messages.createFailed') + ': ' + result.error)
    }
    
    contextMenuNodeRef.current = null
  }

  const handleCreateFile = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI || !state.workspacePath) return
    
    const parentPath = contextMenuNodeRef.current.key as string
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const fileName = `${t('newNote')}_${dateStr}.md`
    const filePath = await window.electronAPI.path.join(parentPath, fileName)
    
    const result = await window.electronAPI.writeFile(filePath, '# ' + t('newNote') + '\n\n')
    
    if (result.success) {
      message.success(t('created'))
      await loadFiles(state.workspacePath, true)
      dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
    } else {
      message.error(t('messages.createFailed') + ': ' + result.error)
    }
    
    contextMenuNodeRef.current = null
  }

  const contextMenuItems: MenuProps['items'] = contextMenuNodeRef.current ? [
    {
      key: 'open',
      label: t('contextMenu.open'),
      icon: <FolderOpenOutlined />,
      onClick: () => {
        if (!contextMenuNodeRef.current!.isLeaf) {
        } else {
          const keyPath = contextMenuNodeRef.current!.key as string
          const fileName = (contextMenuNodeRef.current!.title as string) || keyPath.split(/[/\\]/).pop() || ''
          dispatch({ 
            type: 'ADD_TAB', 
            payload: { path: keyPath, name: fileName, isDirty: false }
          })
        }
        contextMenuNodeRef.current = null
      },
    },
    ...(contextMenuNodeRef.current.isLeaf ? [
      {
        key: 'openInNewTab',
        label: t('contextMenu.openInNewTab'),
        icon: <FileTextOutlined />,
        onClick: () => {
          const keyPath = contextMenuNodeRef.current!.key as string
          const fileName = (contextMenuNodeRef.current!.title as string) || keyPath.split(/[/\\]/).pop() || ''
          dispatch({ 
            type: 'ADD_TAB', 
            payload: { path: keyPath, name: fileName, isDirty: false }
          })
          contextMenuNodeRef.current = null
        },
      },
    ] : []),
    {
      type: 'divider',
    },
    {
      key: 'rename',
      label: t('contextMenu.rename'),
      icon: <EditOutlined />,
      onClick: () => {
        const name = (contextMenuNodeRef.current!.title as string).replace(/\.md$/, '')
        setNewName(name)
        setRenameModalVisible(true)
      },
    },
    {
      key: 'delete',
      label: t('contextMenu.delete'),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => setDeleteModalVisible(true),
    },
    {
      key: 'copyPath',
      label: t('contextMenu.copyPath'),
      icon: <CopyOutlined />,
      onClick: handleCopyPath,
    },
    {
      key: 'openInExplorer',
      label: t('contextMenu.showInExplorer'),
      icon: <FolderOpenOutlined />,
      onClick: handleOpenInExplorer,
    },
    ...(contextMenuNodeRef.current?.isLeaf === false ? [
      {
        type: 'divider' as const,
      },
      {
        key: 'createSubfolder',
        label: t('contextMenu.newSubfolder'),
        icon: <FolderAddOutlined />,
        onClick: handleCreateSubfolder,
      },
      {
        key: 'createFile',
        label: t('contextMenu.newNote'),
        icon: <FileAddOutlined />,
        onClick: handleCreateFile,
      },
    ] : []),
  ] : []

  useEffect(() => {
    if (state.workspacePath && window.electronAPI) {
      loadFiles(state.workspacePath)
      if (!isWatching) {
        startWatching(state.workspacePath)
      }
    }
  }, [state.workspacePath, loadFiles, startWatching, isWatching])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const testWorkspace = urlParams.get('testWorkspace') || localStorage.getItem('testWorkspace')
    
    if (testWorkspace && !state.workspacePath) {
      dispatch({ type: 'SET_WORKSPACE', payload: testWorkspace })
    }
  }, [state.workspacePath, dispatch])

  return (
    <>
      <Sider width={250} style={{ background: isDark ? '#141414' : '#f8fafc', borderRight: `1px solid ${isDark ? '#313244' : '#e5e7eb'}` }}>
        <div style={{ padding: '12px' }}>
          <Button 
            type="primary" 
            icon={<FolderAddOutlined />} 
            onClick={selectWorkspace}
            block
            style={{ marginBottom: 8 }}
          >
            {state.workspacePath ? t('switchWorkspace') : t('openWorkspace')}
          </Button>
          
          {state.workspacePath && (
            <>
              <Button 
                icon={<FileAddOutlined />} 
                onClick={createNewNote}
                block
                style={{ marginBottom: 8 }}
              >
                {t('newNote')}
              </Button>
              
              <Button 
                icon={<FolderAddOutlined />} 
                onClick={() => setShowNewFolderModal(true)}
                block
                style={{ marginBottom: 8 }}
              >
                {t('newFolder')}
              </Button>
              
              <Button 
                icon={<FileTextOutlined />} 
                onClick={() => setTemplateVisible(true)}
                block
                style={{ marginBottom: 8 }}
              >
                {t('useTemplate')}
              </Button>
              
              <Button 
                icon={<SyncOutlined spin={isWatching} />} 
                onClick={refreshFiles}
                block
                style={{ marginBottom: 8 }}
              >
                {isWatching ? t('monitoring') : t('refresh')}
                {isWatching && <Badge status="processing" style={{ marginLeft: 8 }} />}
              </Button>
              
              <Button 
                icon={<ApartmentOutlined />} 
                onClick={() => setShowGraph(true)}
                block
                type="primary"
                ghost
                style={{ marginBottom: 8 }}
              >
                {t('graph')}
              </Button>
            </>
          )}
        </div>
        
        {state.workspacePath && (
          <div style={{ 
            padding: '8px 12px', 
            color: isDark ? '#a6adc8' : '#6b7280', 
            fontSize: '12px', 
            borderBottom: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>📁 {state.workspacePath.split('\\').pop()}</span>
            {isWatching && <Badge status="success" title={t('fileMonitoring')} />}
          </div>
        )}
        
        {lastChange && (
          <div style={{ 
            padding: '4px 12px', 
            color: '#2563eb', 
            fontSize: '11px', 
            background: isDark ? '#1e3a5f' : '#eff6ff',
            borderBottom: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`
          }}>
            🔄 {lastChange}
          </div>
        )}

        <Divider style={{ margin: '8px 0' }} />

        <div style={{ padding: '8px', overflow: 'auto', height: 'calc(100% - 280px)' }}>
          {treeData.length > 0 ? (
            <Dropdown
              menu={{ items: contextMenuItems }}
              trigger={['contextMenu']}
              open={contextMenuVisible}
              onOpenChange={(open) => {
                if (!open) {
                  setContextMenuVisible(false)
                }
              }}
            >
              <div>
                <Tree
                  showIcon
                  treeData={treeData}
                  onSelect={onSelect}
                  selectedKeys={state.currentFile ? [state.currentFile] : []}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys)}
                  loadedKeys={loadedKeys}
                  style={{ background: 'transparent', color: isDark ? '#e6e6e6' : '#1f2937' }}
                  draggable
                  onDrop={handleDrop}
                  blockNode
                  onRightClick={({ node, event }) => {
                    handleContextMenu(node, event as React.MouseEvent)
                  }}
                  loadData={async (node: any) => {
                console.log('loadData called with node:', node)
                const nodePath = node.key
                const isLeaf = node.props?.isLeaf ?? node.isLeaf
                console.log('nodePath:', nodePath, 'isLeaf:', isLeaf)
                if (isLeaf) return
                
                const result = await window.electronAPI?.listFiles(nodePath)
                console.log('listFiles result:', result)
                if (result?.success && result.files) {
                  const sortedFiles = result.files.sort((a: any, b: any) => {
                    if (a.isDirectory && !b.isDirectory) return -1
                    if (!a.isDirectory && b.isDirectory) return 1
                    return (b.mtime || 0) - (a.mtime || 0)
                  })
                  
                  const children = sortedFiles.map((file: { name: string; path: string; isDirectory: boolean }) => ({
                    key: file.path,
                    title: file.name,
                    isLeaf: !file.isDirectory,
                    icon: file.isDirectory ? <FolderOutlined /> : <FileOutlined />,
                  }))
                  
                  console.log('children to add:', children)
                  
                  setLoadedKeys(prev => [...prev, nodePath])
                  
                  setTreeData(prevData => {
                    const updateNode = (nodes: TreeDataNode[]): TreeDataNode[] => {
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
                    return updateNode(prevData)
                  })
                }
              }}
            />
              </div>
            </Dropdown>
          ) : (
            <div style={{ color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'center', padding: '20px 10px', fontSize: 12 }}>
              {state.workspacePath ? t('workspaceEmpty') : t('pleaseOpenWorkspace')}
            </div>
          )}
        </div>
      </Sider>
      
      <TemplateSelector
        visible={templateVisible}
        onClose={() => setTemplateVisible(false)}
        onSelect={handleTemplateSelect}
      />
      
      <GraphView
        visible={showGraph}
        onClose={() => setShowGraph(false)}
        workspacePath={state.workspacePath || ''}
        onFileSelect={(path) => dispatch({ type: 'SET_CURRENT_FILE', payload: path })}
      />
      
      <Modal
        title={t('newFolder')}
        open={showNewFolderModal}
        onCancel={() => {
          setShowNewFolderModal(false)
          setNewFolderName('')
        }}
        onOk={createNewFolder}
        okText={t('create')}
        cancelText={t('cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('folderNamePlaceholder')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={createNewFolder}
            autoFocus
          />
        </div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          {t('folderWillBeCreated')}: {state.workspacePath}
        </div>
      </Modal>

      <Modal
        title={t('contextMenu.rename')}
        open={renameModalVisible}
        onCancel={() => {
          setRenameModalVisible(false)
          setNewName('')
        }}
        onOk={handleRename}
        okText={t('confirm')}
        cancelText={t('cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('newNamePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleRename}
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        title={t('confirmDelete')}
        open={deleteModalVisible}
        onCancel={() => {
          setDeleteModalVisible(false)
        }}
        onOk={handleDelete}
        okText={t('contextMenu.delete')}
        cancelText={t('cancel')}
        okButtonProps={{ danger: true }}
      >
        <p>{t('deleteConfirmMessage')} {String(contextMenuNodeRef.current?.title || '')}?</p>
      </Modal>
    </>
  )
}

export default Sidebar
