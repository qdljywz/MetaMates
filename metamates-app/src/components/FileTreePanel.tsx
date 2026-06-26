import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Tree, Button, message, Modal, Input, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  FolderOutlined,
  FileOutlined,
  FolderAddOutlined,
  FileAddOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined,
  SyncOutlined,
  SwapOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import type { TreeDataNode, TreeProps, MenuProps } from 'antd'
import { useAppContext } from '../store/AppContext'
import { getWorkspaceLanguage } from '../constants/paths'
import { workspaceIndexService } from '../services/workspaceIndex'
import { isImportableDocument } from '../../electron/shared/importableFormats'
import { importDocumentAsIntelligence } from '../services/intelligenceImport'
import TemplateSelector from './TemplateSelector'
import ContextMenu from './ContextMenu'
import DailyNoteCalendar from './DailyNoteCalendar'
import './FileTreePanel.css'
import { collectRequiredExpandKeys } from '../utils/fileTreeExpand'

interface FileTreePanelProps {
  collapsed: boolean
  refreshKey?: number
  workspaceLoading?: boolean
}

const FileTreePanel: React.FC<FileTreePanelProps> = ({ collapsed, refreshKey, workspaceLoading = false }) => {
  const { t, i18n } = useTranslation('sidebar')
  const { state, dispatch } = useAppContext()
  const [treeData, setTreeData] = useState<TreeDataNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [filteredTreeData, setFilteredTreeData] = useState<TreeDataNode[]>([])
  const contextMenuNodeRef = useRef<TreeDataNode | null>(null)
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [renameModalVisible, setRenameModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [newFileModalVisible, setNewFileModalVisible] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [templateVisible, setTemplateVisible] = useState(false)
  const [templateTargetPath, setTemplateTargetPath] = useState<string | null>(null)
  const [reinitLoading, setReinitLoading] = useState(false)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [importIntelLoading, setImportIntelLoading] = useState(false)
  const [legacyPaths, setLegacyPaths] = useState<string[]>([])
  /** Folders expanded automatically because an open tab needs them. */
  const autoExpandedKeysRef = useRef<Set<string>>(new Set())
  /** Folders the user expanded manually (kept across tab close). */
  const userExpandedKeysRef = useRef<Set<string>>(new Set())
  const loadedKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    loadedKeysRef.current = new Set(loadedKeys.map(String))
  }, [loadedKeys])

  const sortListedFiles = useCallback((files: Array<{ name: string; path: string; isDirectory: boolean; mtime?: number }>) => {
    return [...files].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return (b.mtime || 0) - (a.mtime || 0)
    })
  }, [])

  const mapFilesToTreeNodes = useCallback((files: Array<{ name: string; path: string; isDirectory: boolean }>): TreeDataNode[] => {
    return sortListedFiles(files).map((file) => ({
      key: file.path,
      title: file.name,
      isLeaf: !file.isDirectory,
      icon: file.isDirectory ? <FolderOutlined /> : <FileOutlined />,
    }))
  }, [sortListedFiles])

  const attachChildrenToTree = useCallback((nodePath: string, children: TreeDataNode[]) => {
    setTreeData((prevData) => {
      const updateNode = (nodes: TreeDataNode[]): TreeDataNode[] =>
        nodes.map((n) => {
          if (n.key === nodePath) return { ...n, children }
          if (n.children) return { ...n, children: updateNode(n.children) }
          return n
        })
      return updateNode(prevData)
    })
  }, [])

  const loadNodeChildren = useCallback(async (nodePath: string) => {
    if (!window.electronAPI || loadedKeysRef.current.has(nodePath)) return
    const result = await window.electronAPI.listFiles(nodePath)
    if (!result?.success || !result.files) return
    const children = mapFilesToTreeNodes(result.files)
    loadedKeysRef.current.add(nodePath)
    setLoadedKeys((prev) => (prev.includes(nodePath) ? prev : [...prev, nodePath]))
    attachChildrenToTree(nodePath, children)
  }, [attachChildrenToTree, mapFilesToTreeNodes])

  const applyExpandedKeysFromOpenFiles = useCallback((filePaths: string[]) => {
    if (!state.workspacePath) return
    const required = collectRequiredExpandKeys(filePaths, state.workspacePath)
    autoExpandedKeysRef.current = new Set(required)
    const merged = new Set<string>([...userExpandedKeysRef.current, ...required])
    setExpandedKeys([...merged])
  }, [state.workspacePath])

  const revealFilesInTree = useCallback(async (filePaths: string[]) => {
    if (!state.workspacePath || filePaths.length === 0) {
      applyExpandedKeysFromOpenFiles([])
      return
    }
    const dirs = new Set<string>()
    for (const filePath of filePaths) {
      for (const dir of collectRequiredExpandKeys([filePath], state.workspacePath)) {
        dirs.add(dir)
      }
    }
    const sortedDirs = [...dirs].sort((a, b) => a.length - b.length)
    for (const dir of sortedDirs) {
      await loadNodeChildren(dir)
    }
    applyExpandedKeysFromOpenFiles(filePaths)
  }, [applyExpandedKeysFromOpenFiles, loadNodeChildren, state.workspacePath])

  const openFilePathsKey = state.openTabs.map((tab) => tab.path).join('\0')
  const revealTargetKey = `${openFilePathsKey}\0${state.currentFile ?? ''}`

  useEffect(() => {
    const paths = new Set(state.openTabs.map((tab) => tab.path))
    if (state.currentFile) paths.add(state.currentFile)
    void revealFilesInTree([...paths])
  }, [revealTargetKey, state.workspacePath, revealFilesInTree])

  const loadFiles = useCallback(async (dirPath: string) => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.listFiles(dirPath)
    if (result.success && result.files) {
      const sortedFiles = result.files.sort((a: any, b: any) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return (b.mtime || 0) - (a.mtime || 0)
      })
      const data: TreeDataNode[] = sortedFiles.map((file: { name: string; path: string; isDirectory: boolean }) => ({
        key: file.path,
        title: file.name,
        isLeaf: !file.isDirectory,
        icon: file.isDirectory ? <FolderOutlined /> : <FileOutlined />,
      }))
      setTreeData(data)
      setLoadedKeys([])
    }
  }, [])

  const handleReinitWorkspace = async () => {
    if (!window.electronAPI || !state.workspacePath) return
    
    setReinitLoading(true)
    try {
      const language = getWorkspaceLanguage(i18n.language)
      console.log('[Reinit] Current language:', i18n.language, '-> Using:', language)
      console.log('[Reinit] Workspace path:', state.workspacePath)
      const result = await window.electronAPI.reinitWorkspace(state.workspacePath, language)
      console.log('[Reinit] Result:', result)
      if (result.success) {
        loadFiles(state.workspacePath)
        message.success(result.message || `已添加 ${result.createdItems?.length || 0} 个项目`)
      } else {
        message.error(t('messages.reinitFailed') + ': ' + result.error)
      }
    } catch (error: any) {
      console.error('[Reinit] Error:', error)
      message.error(t('messages.reinitFailed') + ': ' + error.message)
    } finally {
      setReinitLoading(false)
    }
  }

  const handleMigrateWorkspace = async () => {
    if (!window.electronAPI || !state.workspacePath) return

    setMigrateLoading(true)
    try {
      const language = getWorkspaceLanguage(i18n.language)
      const result = await window.electronAPI.migrateWorkspace(state.workspacePath, language)
      if (result.success) {
        loadFiles(state.workspacePath)
        void workspaceIndexService.rebuild(state.workspacePath)
        setLegacyPaths([])
        message.success(
          t('messages.migrateSuccess', { count: result.migrated.length }) ||
            `已迁移 ${result.migrated.length} 项到标准目录`
        )
      } else {
        message.error(t('messages.migrateFailed') + ': ' + result.error)
      }
    } catch (error: any) {
      message.error(t('messages.migrateFailed') + ': ' + error.message)
    } finally {
      setMigrateLoading(false)
    }
  }

  const checkLegacyPaths = useCallback(async () => {
    if (!window.electronAPI || !state.workspacePath) return
    const language = getWorkspaceLanguage(i18n.language)
    const result = await window.electronAPI.detectLegacyPaths(state.workspacePath, language)
    if (result.success && result.needsMigration) {
      setLegacyPaths(result.legacy)
    } else {
      setLegacyPaths([])
    }
  }, [state.workspacePath, i18n.language])

  useEffect(() => {
    userExpandedKeysRef.current.clear()
    autoExpandedKeysRef.current.clear()
    loadedKeysRef.current.clear()
  }, [state.workspacePath])

  useEffect(() => {
    if (state.workspacePath && window.electronAPI) {
      const language = getWorkspaceLanguage(i18n.language)
      window.electronAPI.initWorkspace(state.workspacePath, language).then((result) => {
        if (result.success && result.initialized) {
          const key = `metamates-init-toast:${state.workspacePath}`
          if (!sessionStorage.getItem(key)) {
            message.success(t('messages.workspaceInitialized'))
            sessionStorage.setItem(key, '1')
          }
        }
        loadFiles(state.workspacePath)
        void checkLegacyPaths()
      })
    }
  }, [state.workspacePath, loadFiles, checkLegacyPaths, i18n.language, t])

  useEffect(() => {
    if (refreshKey && refreshKey > 0 && state.workspacePath && window.electronAPI) {
      loadFiles(state.workspacePath)
    }
  }, [refreshKey, state.workspacePath, loadFiles])

  useEffect(() => {
    if (!state.workspacePath) return
    const unsubscribe = workspaceIndexService.onVaultChanged(() => {
      loadFiles(state.workspacePath)
    })
    return unsubscribe
  }, [state.workspacePath, loadFiles])

  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredTreeData(treeData)
      return
    }
    const filterNodes = (nodes: TreeDataNode[]): TreeDataNode[] => {
      return nodes.reduce((acc: TreeDataNode[], node) => {
        const title = (node.title as string).toLowerCase()
        const search = searchText.toLowerCase()
        if (title.includes(search)) {
          acc.push(node)
        } else if (node.children) {
          const filteredChildren = filterNodes(node.children)
          if (filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren })
          }
        }
        return acc
      }, [])
    }
    setFilteredTreeData(filterNodes(treeData))
  }, [searchText, treeData])

  const onSelect: TreeProps['onSelect'] = (selectedKeys, info) => {
    if (selectedKeys.length > 0) {
      const path = selectedKeys[0] as string
      const node = info.node as TreeDataNode
      const isFolder = node.isLeaf === false
      
      if (isFolder) {
        const nodeKey = node.key as string
        if (expandedKeys.includes(nodeKey)) {
          userExpandedKeysRef.current.delete(nodeKey)
          autoExpandedKeysRef.current.delete(nodeKey)
          setExpandedKeys(expandedKeys.filter((k) => k !== nodeKey))
        } else {
          userExpandedKeysRef.current.add(nodeKey)
          setExpandedKeys([...expandedKeys, nodeKey])
        }
      } else {
        // 单击文件时打开文件
        const fileName = (node.title as string) || path.split(/[/\\]/).pop() || path
        dispatch({
          type: 'ADD_TAB',
          payload: { path, name: fileName, isDirty: false }
        })
      }
    }
  }

  const handleContextMenu = (node: TreeDataNode, e: React.MouseEvent) => {
    e.preventDefault()
    contextMenuNodeRef.current = node
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuVisible(true)
  }

  const handleRename = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI) return
    const oldPath = contextMenuNodeRef.current.key as string
    const parentDir = await window.electronAPI.path.dirname(oldPath)
    const isDir = !contextMenuNodeRef.current.isLeaf
    const ext = isDir ? '' : '.md'
    const newPath = await window.electronAPI.path.join(parentDir, newName + ext)
    if (oldPath === newPath) {
      setRenameModalVisible(false)
      return
    }
    const result = await window.electronAPI.renameFile(oldPath, newPath)
    if (result.success) {
      message.success(t('messages.renameSuccess'))
      await loadFiles(state.workspacePath!)
      if (state.currentFile === oldPath) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: newPath })
      }
    } else {
      message.error(t('messages.renameSuccess') + ': ' + result.error)
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
      await loadFiles(state.workspacePath!)
      if (state.currentFile === filePath) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: null })
      }
    } else {
      message.error(t('messages.deleteFailed') + ': ' + result.error)
    }
    setDeleteModalVisible(false)
    contextMenuNodeRef.current = null
  }

  const handleCreateFile = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI || !newFileName.trim()) return
    
    const parentNode = contextMenuNodeRef.current
    const parentPath = parentNode.isLeaf === false 
      ? (parentNode.key as string)
      : await window.electronAPI.path.dirname(parentNode.key as string)
    
    const fileName = newFileName.trim().endsWith('.md') ? newFileName.trim() : `${newFileName.trim()}.md`
    const filePath = await window.electronAPI.path.join(parentPath, fileName)
    
    const result = await window.electronAPI.writeFile(filePath, `# ${newFileName.trim()}\n\n`)
    
    if (result.success) {
      message.success(t('messages.fileCreated'))
      await loadFiles(state.workspacePath!)
      dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
    } else {
      message.error(t('messages.createFailed') + ': ' + result.error)
    }
    
    setNewFileModalVisible(false)
    setNewFileName('')
    contextMenuNodeRef.current = null
  }

  const handleCreateFolder = async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI || !newFolderName.trim()) return
    
    const parentNode = contextMenuNodeRef.current
    const parentPath = parentNode.isLeaf === false 
      ? (parentNode.key as string)
      : await window.electronAPI.path.dirname(parentNode.key as string)
    
    const folderPath = await window.electronAPI.path.join(parentPath, newFolderName.trim())
    
    const result = await window.electronAPI.createDirectory(folderPath)
    
    if (result.success) {
      message.success(t('messages.folderCreated'))
      await loadFiles(state.workspacePath!)
    } else {
      message.error(t('messages.createFailed') + ': ' + result.error)
    }
    
    setNewFolderModalVisible(false)
    setNewFolderName('')
    contextMenuNodeRef.current = null
  }

  const handleOpenInExplorer = useCallback(async () => {
    if (!contextMenuNodeRef.current || !window.electronAPI) return
    const filePath = contextMenuNodeRef.current.key as string
    await window.electronAPI.openInExplorer(filePath)
    contextMenuNodeRef.current = null
  }, [])

  const handleImportIntelligence = useCallback(async (sourcePath: string) => {
    if (!state.workspacePath || !window.electronAPI) {
      message.warning(t('pleaseOpenWorkspaceFirst'))
      return
    }
    setImportIntelLoading(true)
    setContextMenuVisible(false)
    const hide = message.loading(t('messages.importIntelligenceRunning'), 0)
    try {
      const result = await importDocumentAsIntelligence(
        state.workspacePath,
        sourcePath,
        getWorkspaceLanguage(i18n.language),
      )
      if (result.error === 'canceled') return
      if (!result.success || !result.notePath) {
        message.error(result.error || t('messages.importIntelligenceFailed'))
        return
      }
      dispatch({
        type: 'ADD_TAB',
        payload: { path: result.notePath, name: result.noteName || 'intel.md', isDirty: false },
      })
      message.success(t('messages.importIntelligenceSuccess', { name: result.noteName }))
      if (result.warnings?.length) {
        message.warning(result.warnings.join('；'))
      }
      await loadFiles(state.workspacePath)
    } finally {
      hide()
      setImportIntelLoading(false)
      contextMenuNodeRef.current = null
    }
  }, [state.workspacePath, i18n.language, dispatch, loadFiles, t])

  const handleUseTemplate = () => {
    setTemplateVisible(true)
  }

  const handleDrop: TreeProps['onDrop'] = async (info) => {
    if (!window.electronAPI || !state.workspacePath) return
    
    const dropNode = info.node
    const dragNode = info.dragNode
    
    if (!dropNode || !dragNode) return
    
    const dragPath = dragNode.key as string
    const dropPath = dropNode.key as string
    
    if (dragPath === dropPath) return
    
    const isDropToFolder = dropNode.isLeaf === false
    
    let targetPath: string
    
    if (isDropToFolder && info.dropToGap === false) {
      const baseName = await window.electronAPI.path.basename(dragPath)
      targetPath = await window.electronAPI.path.join(dropPath, baseName)
    } else {
      const dropDir = await window.electronAPI.path.dirname(dropPath)
      const baseName = await window.electronAPI.path.basename(dragPath)
      targetPath = await window.electronAPI.path.join(dropDir, baseName)
    }
    
    if (dragPath === targetPath) return
    
    const result = await window.electronAPI.renameFile(dragPath, targetPath)
    
    if (result.success) {
      const baseName = await window.electronAPI.path.basename(dragPath)
      message.success(t('messages.moveSuccess', { name: baseName }))
      await loadFiles(state.workspacePath!)
      
      if (state.currentFile === dragPath) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: targetPath })
      }
    } else {
      message.error(t('messages.moveFailed') + ': ' + result.error)
    }
  }

  const isFolder = contextMenuNodeRef.current?.isLeaf === false

  const folderMenuItems: MenuProps['items'] = [
    {
      key: 'expand',
      label: t('expand'),
      icon: <FolderOpenOutlined />,
      onClick: () => {
        if (!expandedKeys.includes(contextMenuNodeRef.current!.key as string)) {
          setExpandedKeys([...expandedKeys, contextMenuNodeRef.current!.key as string])
        }
        setContextMenuVisible(false)
        contextMenuNodeRef.current = null
      },
    },
    { type: 'divider' },
    {
      key: 'newFile',
      label: t('contextMenu.newNote'),
      icon: <FileAddOutlined />,
      onClick: () => {
        setContextMenuVisible(false)
        setNewFileModalVisible(true)
      },
    },
    {
      key: 'newFolder',
      label: t('contextMenu.newSubfolder'),
      icon: <FolderAddOutlined />,
      onClick: () => {
        setContextMenuVisible(false)
        setNewFolderModalVisible(true)
      },
    },
    {
      key: 'template',
      label: t('contextMenu.useTemplate'),
      icon: <FileTextOutlined />,
      onClick: async () => {
        if (!contextMenuNodeRef.current || !window.electronAPI) return
        const parentNode = contextMenuNodeRef.current
        const parentPath = parentNode.isLeaf === false 
          ? (parentNode.key as string)
          : await window.electronAPI.path.dirname(parentNode.key as string)
        setTemplateTargetPath(parentPath)
        setContextMenuVisible(false)
        setTemplateVisible(true)
      },
    },
    { type: 'divider' },
    {
      key: 'rename',
      label: t('contextMenu.rename'),
      icon: <EditOutlined />,
      onClick: () => {
        const name = (contextMenuNodeRef.current!.title as string)
        setNewName(name)
        setContextMenuVisible(false)
        setRenameModalVisible(true)
      },
    },
    {
      key: 'delete',
      label: t('contextMenu.deleteFolder'),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {
        setContextMenuVisible(false)
        setDeleteModalVisible(true)
      },
    },
    { type: 'divider' },
    {
      key: 'copyPath',
      label: t('contextMenu.copyPath'),
      icon: <CopyOutlined />,
      onClick: () => {
        if (!contextMenuNodeRef.current) return
        navigator.clipboard.writeText(contextMenuNodeRef.current.key as string)
        message.success(t('messages.copySuccess'))
        setContextMenuVisible(false)
        contextMenuNodeRef.current = null
      },
    },
    {
      key: 'openInExplorer',
      label: t('contextMenu.openInExplorer'),
      icon: <FolderOpenOutlined />,
      onClick: () => {
        setContextMenuVisible(false)
        handleOpenInExplorer()
      },
    },
  ]

  const getFileMenuItems = useCallback((): MenuProps['items'] => {
    const node = contextMenuNodeRef.current
    const filePath = node?.key as string | undefined
    const items: MenuProps['items'] = [
      {
        key: 'open',
        label: t('contextMenu.open'),
        icon: <FolderOpenOutlined />,
        onClick: () => {
          const fileName = (contextMenuNodeRef.current!.title as string) || ''
          dispatch({
            type: 'ADD_TAB',
            payload: { path: contextMenuNodeRef.current!.key as string, name: fileName, isDirty: false },
          })
          setContextMenuVisible(false)
          contextMenuNodeRef.current = null
        },
      },
      {
        key: 'openInNewTab',
        label: t('contextMenu.openInNewTab'),
        icon: <FileTextOutlined />,
        onClick: () => {
          const fileName = (contextMenuNodeRef.current!.title as string) || ''
          dispatch({
            type: 'ADD_TAB',
            payload: { path: contextMenuNodeRef.current!.key as string, name: fileName, isDirty: false },
          })
          setContextMenuVisible(false)
          contextMenuNodeRef.current = null
        },
      },
    ]

    if (filePath && isImportableDocument(filePath)) {
      items.push({
        key: 'importIntelligence',
        label: t('contextMenu.importIntelligence'),
        icon: <ImportOutlined />,
        disabled: importIntelLoading,
        onClick: () => {
          void handleImportIntelligence(filePath)
        },
      })
    }

    items.push(
      { type: 'divider' },
      {
        key: 'rename',
        label: t('contextMenu.rename'),
        icon: <EditOutlined />,
        onClick: () => {
          const name = (contextMenuNodeRef.current!.title as string).replace(/\.md$/, '')
          setNewName(name)
          setContextMenuVisible(false)
          setRenameModalVisible(true)
        },
      },
      {
        key: 'delete',
        label: t('contextMenu.delete'),
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => {
          setContextMenuVisible(false)
          setDeleteModalVisible(true)
        },
      },
      { type: 'divider' },
      {
        key: 'copyPath',
        label: t('contextMenu.copyPath'),
        icon: <CopyOutlined />,
        onClick: () => {
          if (!contextMenuNodeRef.current) return
          navigator.clipboard.writeText(contextMenuNodeRef.current.key as string)
          message.success(t('messages.copySuccess'))
          setContextMenuVisible(false)
          contextMenuNodeRef.current = null
        },
      },
      {
        key: 'openInExplorer',
        label: t('contextMenu.openInExplorer'),
        icon: <FolderOpenOutlined />,
        onClick: () => {
          setContextMenuVisible(false)
          void handleOpenInExplorer()
        },
      },
    )

    return items
  }, [dispatch, handleImportIntelligence, handleOpenInExplorer, importIntelLoading, t])

  const handleOpenDailyNote = useCallback((path: string, name: string) => {
    dispatch({ type: 'ADD_TAB', payload: { path, name, isDirty: false } })
  }, [dispatch])

  const renderTreeTitle = useCallback((node: TreeDataNode) => {
    const isLeaf = node.isLeaf
    return (
      <span
        draggable={!!isLeaf}
        onDragStart={(event) => {
          if (!isLeaf) return
          event.dataTransfer.setData('application/x-metamates-path', String(node.key))
          event.dataTransfer.effectAllowed = 'copy'
        }}
      >
        {typeof node.title === 'function' ? node.title(node) : node.title}
      </span>
    )
  }, [])

  const contextMenuItems: MenuProps['items'] = contextMenuNodeRef.current
    ? (isFolder ? folderMenuItems : getFileMenuItems())
    : []

  return (
    <>
      <div className={`file-tree-panel ${collapsed ? 'collapsed' : ''}`} data-testid="file-tree">
        <div className="file-tree-panel-header">
          <Button
            type="text"
            icon={<SyncOutlined spin={reinitLoading} />}
            onClick={handleReinitWorkspace}
            loading={reinitLoading}
            size="small"
            title={t('reinitWorkspace')}
          />
          {legacyPaths.length > 0 && (
            <Button
              type="text"
              icon={<SwapOutlined spin={migrateLoading} />}
              onClick={handleMigrateWorkspace}
              loading={migrateLoading}
              size="small"
              title={t('migrateWorkspace')}
              style={{ color: '#f59e0b' }}
            />
          )}
          {!collapsed && (
            <div className="file-tree-panel-title">
              {state.workspacePath ? state.workspacePath.split('\\').pop() : t('title')}
            </div>
          )}
        </div>
        
        {!collapsed && (
          <div style={{ padding: '0 12px' }}>
            <DailyNoteCalendar
              onOpenNote={handleOpenDailyNote}
              onEntryCreated={() => {
                if (state.workspacePath) void loadFiles(state.workspacePath)
              }}
            />
            <Input
              placeholder={t('searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              style={{ width: '100%' }}
            />
          </div>
        )}
        
        {!collapsed && (
          <div className="file-tree-content">
            {filteredTreeData.length > 0 ? (
              <Tree
                showIcon
                draggable
                onDrop={handleDrop}
                treeData={filteredTreeData}
                titleRender={renderTreeTitle}
                onSelect={onSelect}
                selectedKeys={state.currentFile ? [state.currentFile] : []}
                expandedKeys={expandedKeys}
                onExpand={(keys) => {
                  const next = keys as string[]
                  const prev = expandedKeys.map(String)
                  for (const key of next) {
                    if (!prev.includes(key)) userExpandedKeysRef.current.add(key)
                  }
                  for (const key of prev) {
                    if (!next.includes(key)) {
                      userExpandedKeysRef.current.delete(key)
                      autoExpandedKeysRef.current.delete(key)
                    }
                  }
                  setExpandedKeys(next)
                }}
                loadedKeys={loadedKeys}
                blockNode
                onRightClick={({ node, event }) => {
                  handleContextMenu(node, event as React.MouseEvent)
                }}
                loadData={async (node: TreeDataNode) => {
                  const nodePath = String(node.key)
                  if (node.isLeaf) return
                  await loadNodeChildren(nodePath)
                }}
              />
            ) : workspaceLoading ? (
              <div className="file-tree-empty">
                <Spin size="small" />
                <span style={{ marginLeft: 8 }}>{t('loadingWorkspace')}</span>
              </div>
            ) : (
              <div className="file-tree-empty">
                {state.workspacePath ? t('noMatchingFiles') : t('pleaseOpenWorkspace')}
              </div>
            )}
          </div>
        )}
      </div>

      <ContextMenu
        visible={contextMenuVisible}
        x={contextMenuPosition.x}
        y={contextMenuPosition.y}
        items={contextMenuItems}
        onClose={() => {
          setContextMenuVisible(false)
          contextMenuNodeRef.current = null
        }}
      />

      <Modal
        title={t('actions.rename')}
        open={renameModalVisible}
        onCancel={() => {
          setRenameModalVisible(false)
          setNewName('')
        }}
        onOk={handleRename}
        okText={t('actions.confirm')}
        cancelText={t('actions.cancel')}
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
        okText={t('actions.delete')}
        cancelText={t('actions.cancel')}
        okButtonProps={{ danger: true }}
      >
        <p>{t('deleteConfirmMessage')} {String(contextMenuNodeRef.current?.title || '')}？</p>
      </Modal>

      <Modal
        title={t('newNote')}
        open={newFileModalVisible}
        onCancel={() => {
          setNewFileModalVisible(false)
          setNewFileName('')
        }}
        onOk={handleCreateFile}
        okText={t('create')}
        cancelText={t('actions.cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('fileNamePlaceholder')}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onPressEnter={handleCreateFile}
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        title={t('newFolder')}
        open={newFolderModalVisible}
        onCancel={() => {
          setNewFolderModalVisible(false)
          setNewFolderName('')
        }}
        onOk={handleCreateFolder}
        okText={t('create')}
        cancelText={t('actions.cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('folderNamePlaceholder')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={handleCreateFolder}
            autoFocus
          />
        </div>
      </Modal>

      <TemplateSelector
        visible={templateVisible}
        onClose={() => {
          setTemplateVisible(false)
          setTemplateTargetPath(null)
        }}
        onSelect={async (content, template) => {
          if (!templateTargetPath || !window.electronAPI) return
          
          const now = new Date()
          const dateStr = now.toISOString().split('T')[0]
          const fileName = `${dateStr}_${template.name}.md`
          const filePath = await window.electronAPI.path.join(templateTargetPath, fileName)
          
          const result = await window.electronAPI.writeFile(filePath, content)
          
          if (result.success) {
            message.success(t('messages.fileCreated'))
            await loadFiles(state.workspacePath!)
            dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
          } else {
            message.error(t('messages.createFailed') + ': ' + result.error)
          }
          
          setTemplateVisible(false)
          setTemplateTargetPath(null)
        }}
      />
    </>
  )
}

export default FileTreePanel

