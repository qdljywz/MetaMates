import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { flushSync } from 'react-dom'
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
import { isHiddenFromFileTree } from '../services/vaultPaths'
import { workspaceIndexService } from '../services/workspaceIndex'
import { getDocumentFormat, isImportableDocument, SUPPORTED_IMPORT_EXTENSIONS } from '../../electron/shared/importableFormats'
import { importDocumentAsIntelligence } from '../services/intelligenceImport'
import { detectPluginInstallRequired } from '../utils/pluginInstallPrompt'
import { openPluginInstallToast } from '../utils/openPluginInstallToast'
import TemplateSelector from './TemplateSelector'
import ContextMenu from './ContextMenu'
import DailyNoteCalendar from './DailyNoteCalendar'
import './FileTreePanel.css'
import { collectRequiredExpandKeys, getTreeRefreshParentDir, treePathsEqual } from '../utils/fileTreeExpand'
import { getRenameTabPayload, getTabPathsToCloseForDeletedFile } from '../utils/tabFileSync'
import {
  getExpandedDirsToRehydrate,
  getVaultCreateRevealExpandKeys,
  isTreeFolderNode,
  mergeRootTreeChildren,
  patchTreeNodeChildren,
  removeTreeNodeByPath,
} from '../utils/fileTreeUx'
import type { FileChangeEvent } from '../types/electron'
import { wasStartupWorkspaceInitDone, consumeStartupFileTreeCache, wasStartupFileTreeReady } from '../utils/startupPreload'

interface FileTreePanelProps {
  collapsed: boolean
  refreshKey?: number
  onOpenInGraph?: (paths: string[], dateLabel: string) => void
  onOpenWorkspace?: () => void
}

const FileTreePanel: React.FC<FileTreePanelProps> = ({ collapsed, refreshKey, onOpenInGraph, onOpenWorkspace }) => {
  const { t, i18n } = useTranslation('sidebar')
  const { state, dispatch } = useAppContext()
  const [treeData, setTreeData] = useState<TreeDataNode[]>([])
  const [userExpandedKeys, setUserExpandedKeys] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const contextMenuNodeRef = useRef<TreeDataNode | null>(null)
  const pendingNewFileParentRef = useRef<string | null>(null)
  const pendingNewFolderParentRef = useRef<string | null>(null)
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [renameModalVisible, setRenameModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [newFileModalVisible, setNewFileModalVisible] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [pendingNewFileParentPath, setPendingNewFileParentPath] = useState<string | null>(null)
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pendingNewFolderParentPath, setPendingNewFolderParentPath] = useState<string | null>(null)
  const [templateVisible, setTemplateVisible] = useState(false)
  const [templateTargetPath, setTemplateTargetPath] = useState<string | null>(null)
  const [reinitLoading, setReinitLoading] = useState(false)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [importIntelLoading, setImportIntelLoading] = useState(false)
  const [legacyPaths, setLegacyPaths] = useState<string[]>([])
  const loadedKeysRef = useRef<Set<string>>(new Set())
  const inFlightLoadsRef = useRef<Set<string>>(new Set())
  const loadGenerationRef = useRef<Map<string, number>>(new Map())
  const vaultRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingVaultEventRef = useRef<FileChangeEvent | undefined>(undefined)
  const treeMutationChainRef = useRef(Promise.resolve())

  const requiredExpandedKeys = useMemo(() => {
    if (!state.workspacePath) return [] as string[]
    const paths = new Set(state.openTabs.map((tab) => tab.path))
    if (state.currentFile) paths.add(state.currentFile)
    return collectRequiredExpandKeys([...paths], state.workspacePath)
  }, [state.currentFile, state.openTabs, state.workspacePath])

  const expandedKeys = useMemo<React.Key[]>(
    () => [...new Set([...userExpandedKeys, ...requiredExpandedKeys])],
    [requiredExpandedKeys, userExpandedKeys],
  )

  const sortListedFiles = useCallback((files: Array<{ name: string; path: string; isDirectory: boolean; mtime?: number }>) => {
    return [...files].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return (b.mtime || 0) - (a.mtime || 0)
    })
  }, [])

  const mapFilesToTreeNodes = useCallback((
    files: Array<{ name: string; path: string; isDirectory: boolean; mtime?: number }>,
    workspacePath: string,
  ): TreeDataNode[] => {
    const visible = files.filter((file) => !isHiddenFromFileTree(workspacePath, file.path))
    return sortListedFiles(visible).map((file) => ({
      key: file.path,
      title: file.name,
      isLeaf: !file.isDirectory,
    }))
  }, [sortListedFiles])

  const renderTreeIcon = useCallback((props: { isLeaf?: boolean }) => (
    props.isLeaf ? <FileOutlined /> : <FolderOutlined />
  ), [])

  const attachChildrenToTree = useCallback((nodePath: string, children: TreeDataNode[]) => {
    setTreeData((prevData) => {
      const { tree, patched } = patchTreeNodeChildren(prevData, nodePath, children)
      return patched ? tree : prevData
    })
  }, [])

  const bumpLoadGeneration = useCallback((nodePath: string) => {
    const next = (loadGenerationRef.current.get(nodePath) ?? 0) + 1
    loadGenerationRef.current.set(nodePath, next)
    return next
  }, [])

  const reloadDirectoryInTree = useCallback(async (dirPath: string) => {
    if (!window.electronAPI || !state.workspacePath) return
    const generation = bumpLoadGeneration(dirPath)
    if (treePathsEqual(dirPath, state.workspacePath) && wasStartupFileTreeReady(state.workspacePath)) {
      const cached = consumeStartupFileTreeCache(state.workspacePath)
      if (cached) {
        if (loadGenerationRef.current.get(dirPath) !== generation) return
        const children = mapFilesToTreeNodes(cached, state.workspacePath)
        setTreeData((prev) => mergeRootTreeChildren(prev, children))
        return
      }
    }
    const result = await window.electronAPI.listFiles(dirPath)
    if (loadGenerationRef.current.get(dirPath) !== generation) return
    if (!result?.success || !result.files) return
    const children = mapFilesToTreeNodes(result.files, state.workspacePath)

    if (treePathsEqual(dirPath, state.workspacePath)) {
      setTreeData((prev) => mergeRootTreeChildren(prev, children))
      return
    }

    loadedKeysRef.current.add(dirPath)
    attachChildrenToTree(dirPath, children)
  }, [attachChildrenToTree, bumpLoadGeneration, mapFilesToTreeNodes, state.workspacePath])

  const refreshTreeFromVaultChange = useCallback(async (event?: FileChangeEvent) => {
    if (!state.workspacePath) return
    if (!event) return

    if (event.dirPath) {
      const parentDir = getTreeRefreshParentDir(state.workspacePath, event)
      await reloadDirectoryInTree(parentDir)
      return
    }
  }, [reloadDirectoryInTree, state.workspacePath])

  const choosePreferredVaultEvent = useCallback((
    current: FileChangeEvent | undefined,
    incoming: FileChangeEvent | undefined,
  ): FileChangeEvent | undefined => {
    if (!incoming) return current
    if (!current) return incoming
    if (!state.workspacePath) return incoming
    if (current.type === 'unlink') return current
    if (incoming.type === 'unlink') return incoming
    const currentDir = getTreeRefreshParentDir(state.workspacePath, current)
    const incomingDir = getTreeRefreshParentDir(state.workspacePath, incoming)
    return incomingDir.length >= currentDir.length ? incoming : current
  }, [state.workspacePath])

  const scheduleRefreshFromVaultChange = useCallback((event?: FileChangeEvent) => {
    pendingVaultEventRef.current = choosePreferredVaultEvent(pendingVaultEventRef.current, event)
    if (vaultRefreshTimerRef.current) {
      clearTimeout(vaultRefreshTimerRef.current)
    }
    vaultRefreshTimerRef.current = setTimeout(() => {
      vaultRefreshTimerRef.current = null
      const pending = pendingVaultEventRef.current
      pendingVaultEventRef.current = undefined
      void refreshTreeFromVaultChange(pending)
    }, 200)
  }, [choosePreferredVaultEvent, refreshTreeFromVaultChange])

  const loadNodeChildren = useCallback(async (nodePath: string) => {
    if (!window.electronAPI) return
    if (inFlightLoadsRef.current.has(nodePath)) return
    const generation = bumpLoadGeneration(nodePath)
    inFlightLoadsRef.current.add(nodePath)
    try {
      const result = await window.electronAPI.listFiles(nodePath)
      if (loadGenerationRef.current.get(nodePath) !== generation) return
      if (!result?.success || !result.files) return
      const children = mapFilesToTreeNodes(result.files, state.workspacePath)
      loadedKeysRef.current.add(nodePath)
      attachChildrenToTree(nodePath, children)
    } finally {
      inFlightLoadsRef.current.delete(nodePath)
    }
  }, [attachChildrenToTree, bumpLoadGeneration, mapFilesToTreeNodes, state.workspacePath])

  useEffect(() => {
    if (!state.workspacePath) return
    const toLoad = expandedKeys
      .map(String)
      .filter((key) => !treePathsEqual(key, state.workspacePath))
      .filter((key) => ![...loadedKeysRef.current].some((k) => treePathsEqual(k, key)))
    if (toLoad.length > 0) {
      void Promise.all(toLoad.map((dir) => loadNodeChildren(dir)))
    }
  }, [expandedKeys, loadNodeChildren, state.workspacePath])

  useEffect(() => {
    if (!state.workspacePath) return
    if (state.openTabs.length > 0) return
    if (state.currentFile) return
    setUserExpandedKeys([])
  }, [state.currentFile, state.openTabs.length, state.workspacePath])

  /** Reload workspace root and re-attach children for expanded folders. */
  const refreshExpandedTree = useCallback(async () => {
    if (!state.workspacePath || !window.electronAPI) return

    await reloadDirectoryInTree(state.workspacePath)

    const dirsToReload = getExpandedDirsToRehydrate(state.workspacePath, expandedKeys.map(String))
    if (dirsToReload.length === 0) return

    for (const dir of dirsToReload) {
      loadedKeysRef.current.delete(dir)
    }
    await Promise.all(dirsToReload.map((dir) => reloadDirectoryInTree(dir)))
  }, [expandedKeys, reloadDirectoryInTree, state.workspacePath])

  /** After create in a folder: patch treeData so new items appear under `.ant-tree-title`. */
  const refreshAfterCreateInFolder = useCallback(async (parentPath: string, createdPath?: string) => {
    if (!state.workspacePath || !window.electronAPI) return

    bumpLoadGeneration(parentPath)
    const result = await window.electronAPI.listFiles(parentPath)
    if (!result?.success || !result.files) return
    const children = mapFilesToTreeNodes(result.files, state.workspacePath)

    flushSync(() => {
      setTreeData((prev) => {
        if (treePathsEqual(parentPath, state.workspacePath!)) {
          return mergeRootTreeChildren(prev, children)
        }
        const next = patchTreeNodeChildren(prev, parentPath, children)
        return next.patched ? next.tree : prev
      })
    })
    if (!treePathsEqual(parentPath, state.workspacePath)) {
      await refreshExpandedTree()
    }
    await reloadDirectoryInTree(parentPath)

    if (!createdPath) return

    const expandDirs = getVaultCreateRevealExpandKeys(createdPath, parentPath, state.workspacePath)
    setUserExpandedKeys((prev) => [...new Set([...prev, ...expandDirs])])
    const dirsToLoad = [...expandDirs]
      .filter((dir) => !treePathsEqual(dir, parentPath))
      .sort((a, b) => a.length - b.length)
    if (dirsToLoad.length > 0) {
      await Promise.all(dirsToLoad.map((dir) => loadNodeChildren(dir)))
    }
  }, [bumpLoadGeneration, loadNodeChildren, mapFilesToTreeNodes, refreshExpandedTree, reloadDirectoryInTree, state.workspacePath])

  /** 删除后立即从树中移除并重新列出父目录 */
  const refreshAfterDeleteInTree = useCallback(async (filePath: string, isDirectory = false) => {
    if (!window.electronAPI || !state.workspacePath) return

    const parentDir = await window.electronAPI.path.dirname(filePath)

    flushSync(() => {
      setTreeData((prev) => removeTreeNodeByPath(prev, filePath).tree)
    })

    if (isDirectory) {
      const normalized = filePath.replace(/\//g, '\\').toLowerCase()
      for (const key of [...loadedKeysRef.current]) {
        const keyLower = key.replace(/\//g, '\\').toLowerCase()
        if (treePathsEqual(key, filePath) || keyLower.startsWith(`${normalized}\\`)) {
          loadedKeysRef.current.delete(key)
        }
      }
      setUserExpandedKeys((prev) =>
        prev.filter((key) => {
          const keyLower = key.replace(/\//g, '\\').toLowerCase()
          return !treePathsEqual(key, filePath) && !keyLower.startsWith(`${normalized}\\`)
        }),
      )
    }

    await reloadDirectoryInTree(parentDir)
  }, [reloadDirectoryInTree, state.workspacePath])

  /** 重命名/移动后立即刷新涉及的父目录 */
  const refreshAfterRenameInTree = useCallback(async (oldPath: string, newPath: string) => {
    if (!window.electronAPI || !state.workspacePath) return

    const oldParent = await window.electronAPI.path.dirname(oldPath)
    const newParent = await window.electronAPI.path.dirname(newPath)

    flushSync(() => {
      setTreeData((prev) => removeTreeNodeByPath(prev, oldPath).tree)
    })

    await reloadDirectoryInTree(oldParent)
    if (!treePathsEqual(oldParent, newParent)) {
      await reloadDirectoryInTree(newParent)
    }

    const expandDirs = getVaultCreateRevealExpandKeys(newPath, newParent, state.workspacePath)
    setUserExpandedKeys((prev) => [...new Set([...prev, ...expandDirs])])
    const dirsToLoad = [...expandDirs]
      .filter((dir) => !treePathsEqual(dir, newParent))
      .sort((a, b) => a.length - b.length)
    if (dirsToLoad.length > 0) {
      await Promise.all(dirsToLoad.map((dir) => loadNodeChildren(dir)))
    }
  }, [loadNodeChildren, reloadDirectoryInTree, state.workspacePath])

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
        void refreshExpandedTree()
        message.success(
          result.message || t('messages.reinitSuccess', { count: result.createdItems?.length || 0 })
        )
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
        void refreshExpandedTree()
        void workspaceIndexService.rebuild(state.workspacePath)
        setLegacyPaths([])
        message.success(t('messages.migrateSuccess', { count: result.migrated.length }))
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
    setUserExpandedKeys([])
    loadedKeysRef.current.clear()
  }, [state.workspacePath])

  useEffect(() => {
    if (state.workspacePath && window.electronAPI) {
      if (wasStartupWorkspaceInitDone(state.workspacePath)) {
        void refreshExpandedTree()
        void checkLegacyPaths()
        return
      }
      const language = getWorkspaceLanguage(i18n.language)
      window.electronAPI.initWorkspace(state.workspacePath, language).then((result) => {
        if (result.success && result.initialized) {
          const key = `metamates-init-toast:${state.workspacePath}`
          if (!sessionStorage.getItem(key)) {
            message.success(t('messages.workspaceInitialized'))
            sessionStorage.setItem(key, '1')
          }
        }
        void refreshExpandedTree()
        void checkLegacyPaths()
      })
    }
  }, [state.workspacePath, refreshExpandedTree, checkLegacyPaths, i18n.language, t])

  useEffect(() => {
    if (refreshKey && refreshKey > 0 && state.workspacePath && window.electronAPI) {
      void refreshExpandedTree()
    }
  }, [refreshKey, state.workspacePath, refreshExpandedTree])

  useEffect(() => {
    if (!state.workspacePath) return
    const unsubscribe = workspaceIndexService.onVaultChanged((event) => {
      if (!event) return
      if (event.type === 'create' && event.dirPath) {
        void refreshAfterCreateInFolder(event.dirPath, event.createdPath)
        return
      }
      if (event.type === 'unlink' && event.deletedPath) {
        void refreshAfterDeleteInTree(event.deletedPath, event.isDirectory)
        return
      }
      if (event.type === 'rename' && event.oldPath && event.newPath) {
        void refreshAfterRenameInTree(event.oldPath, event.newPath)
        return
      }
      scheduleRefreshFromVaultChange(event)
    })
    return () => {
      unsubscribe()
      if (vaultRefreshTimerRef.current) {
        clearTimeout(vaultRefreshTimerRef.current)
        vaultRefreshTimerRef.current = null
      }
    }
  }, [refreshAfterCreateInFolder, refreshAfterDeleteInTree, refreshAfterRenameInTree, scheduleRefreshFromVaultChange, state.workspacePath])

  const filteredTreeData = useMemo(() => {
    if (!searchText.trim()) return treeData
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
    return filterNodes(treeData)
  }, [searchText, treeData])

  const toggleFolderExpanded = useCallback((nodeKey: string, isLeaf: boolean | undefined) => {
    const isExpanded = expandedKeys.some((key) => treePathsEqual(String(key), nodeKey))
    setUserExpandedKeys((current) => {
      if (isExpanded) {
        return current.filter((key) => !treePathsEqual(key, nodeKey))
      }
      return current.some((key) => treePathsEqual(key, nodeKey)) ? current : [...current, nodeKey]
    })
    if (!isExpanded && isLeaf === false) {
      void loadNodeChildren(nodeKey)
    }
  }, [expandedKeys, loadNodeChildren])

  const onSelect: TreeProps['onSelect'] = (_selectedKeys, info) => {
    const node = info.node as TreeDataNode
    const path = String(node.key)
    if (isTreeFolderNode(node)) {
      toggleFolderExpanded(path, node.isLeaf)
      return
    }
    const fileName = (node.title as string) || path.split(/[/\\]/).pop() || path
    dispatch({
      type: 'ADD_TAB',
      payload: { path, name: fileName, isDirty: false },
    })
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
      await workspaceIndexService.signalVaultItemRenamed(oldPath, newPath)
      const tabNewName = `${newName}${ext}`
      const renamePayload = getRenameTabPayload(state.openTabs, oldPath, newPath, tabNewName)
      if (renamePayload) {
        dispatch({ type: 'RENAME_TAB', payload: renamePayload })
      } else if (state.currentFile && treePathsEqual(state.currentFile, oldPath)) {
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
    const node = contextMenuNodeRef.current
    const filePath = node.key as string
    const isDirectory = isTreeFolderNode(node)
    const result = await window.electronAPI.deleteFile(filePath)
    if (result.success) {
      message.info(result.alreadyGone ? t('messages.deleteAlreadyGone') : t('messages.deleteSuccess'))
      await workspaceIndexService.signalVaultItemDeleted(filePath, isDirectory)
      for (const tabPath of getTabPathsToCloseForDeletedFile(state.openTabs, filePath)) {
        dispatch({ type: 'CLOSE_TAB', payload: tabPath })
      }
    } else {
      message.error(t('messages.deleteFailed') + ': ' + result.error)
    }
    setDeleteModalVisible(false)
    contextMenuNodeRef.current = null
  }

  const handleCreateFile = async () => {
    const parentPath = pendingNewFileParentRef.current ?? pendingNewFileParentPath
    if (!window.electronAPI || !newFileName.trim() || !parentPath) return
    
    const fileName = newFileName.trim().endsWith('.md') ? newFileName.trim() : `${newFileName.trim()}.md`
    const filePath = await window.electronAPI.path.join(parentPath, fileName)
    
    const result = await window.electronAPI.writeFile(filePath, `# ${newFileName.trim()}\n\n`)
    
    if (result.success) {
      message.success(t('messages.fileCreated'))
      const tabName = filePath.split(/[/\\]/).pop() || fileName
      setNewFileModalVisible(false)
      setNewFileName('')
      pendingNewFileParentRef.current = null
      setPendingNewFileParentPath(null)
      contextMenuNodeRef.current = null
      workspaceIndexService.signalVaultItemCreated(parentPath, filePath)
      dispatch({
        type: 'ADD_TAB',
        payload: { path: filePath, name: tabName, isDirty: false },
      })
    } else {
      message.error(t('messages.createFailed') + ': ' + result.error)
    }
  }

  const handleCreateFolder = async () => {
    const parentPath = pendingNewFolderParentRef.current ?? pendingNewFolderParentPath
    if (!window.electronAPI || !newFolderName.trim() || !parentPath) return
    
    const folderPath = await window.electronAPI.path.join(parentPath, newFolderName.trim())
    
    const result = await window.electronAPI.createDirectory(folderPath)
    
    if (result.success) {
      message.success(t('messages.folderCreated'))
      setNewFolderModalVisible(false)
      setNewFolderName('')
      pendingNewFolderParentRef.current = null
      setPendingNewFolderParentPath(null)
      contextMenuNodeRef.current = null
      workspaceIndexService.signalVaultItemCreated(parentPath, folderPath)
    } else {
      message.error(t('messages.createFailed') + ': ' + result.error)
    }
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
        const pluginPrompt = detectPluginInstallRequired(result)
        if (pluginPrompt.required) {
          openPluginInstallToast(t, pluginPrompt.pluginId)
          return
        }
        message.error(result.error || t('messages.importIntelligenceFailed'))
        return
      }
      dispatch({
        type: 'ADD_TAB',
        payload: { path: result.notePath, name: result.noteName || 'intel.md', isDirty: false },
      })
      message.success(t('messages.importIntelligenceSuccess', { name: result.noteName }))
      if (result.inboxArchivedCount && result.inboxArchivedCount > 0) {
        message.success(t('messages.inboxArchivedAfterIntel', { count: result.inboxArchivedCount }))
      }
      if (result.warnings?.length) {
        message.warning(result.warnings.join(t('messages.listSeparator')))
      }
      const parentDir = await window.electronAPI.path.dirname(result.notePath)
      workspaceIndexService.signalVaultItemCreated(parentDir, result.notePath)
    } finally {
      hide()
      setImportIntelLoading(false)
      contextMenuNodeRef.current = null
    }
  }, [state.workspacePath, i18n.language, dispatch, refreshAfterCreateInFolder, t])

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
      const openTab = state.openTabs.find((tab) => treePathsEqual(tab.path, dragPath))
      if (openTab) {
        const newName = await window.electronAPI.path.basename(targetPath)
        dispatch({ type: 'RENAME_TAB', payload: { oldPath: dragPath, newPath: targetPath, newName } })
      } else if (state.currentFile && treePathsEqual(state.currentFile, dragPath)) {
        dispatch({ type: 'SET_CURRENT_FILE', payload: targetPath })
      }
      await workspaceIndexService.signalVaultItemRenamed(dragPath, targetPath)
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
        const key = contextMenuNodeRef.current!.key as string
        setUserExpandedKeys((prev) => (
          prev.some((item) => treePathsEqual(item, key)) ? prev : [...prev, key]
        ))
        const isLoaded = [...loadedKeysRef.current].some((loadedKey) => treePathsEqual(String(loadedKey), key))
        if (!isLoaded) {
          void loadNodeChildren(key)
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
      onClick: async () => {
        const node = contextMenuNodeRef.current
        if (!node || !window.electronAPI) return
        const parentPath =
          node.isLeaf === false
            ? (node.key as string)
            : await window.electronAPI.path.dirname(node.key as string)
        pendingNewFileParentRef.current = parentPath
        setPendingNewFileParentPath(parentPath)
        setContextMenuVisible(false)
        setNewFileModalVisible(true)
      },
    },
    {
      key: 'newFolder',
      label: t('contextMenu.newSubfolder'),
      icon: <FolderAddOutlined />,
      onClick: async () => {
        const node = contextMenuNodeRef.current
        if (!node || !window.electronAPI) return
        const parentPath =
          node.isLeaf === false
            ? (node.key as string)
            : await window.electronAPI.path.dirname(node.key as string)
        pendingNewFolderParentRef.current = parentPath
        setPendingNewFolderParentPath(parentPath)
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
    const docFormat = filePath ? getDocumentFormat(filePath) : null
    const canImportIntelligence = !!filePath && isImportableDocument(filePath)
    const lowerPath = (filePath || '').toLowerCase()
    const importDisabledReason = !filePath
      ? null
      : docFormat
        ? null
        : lowerPath.endsWith('.doc')
          ? t('contextMenu.importIntelligenceUnsupportedDoc')
          : t('contextMenu.importIntelligenceUnsupported', {
              extensions: SUPPORTED_IMPORT_EXTENSIONS.join(', '),
            })
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

    items.push({
      key: 'importIntelligence',
      label: importDisabledReason
        ? <span title={importDisabledReason} style={{ opacity: 0.65 }}>{t('contextMenu.importIntelligence')}</span>
        : t('contextMenu.importIntelligence'),
      icon: <ImportOutlined />,
      disabled: importIntelLoading || !filePath,
      onClick: () => {
        if (!filePath) return
        if (!canImportIntelligence) {
          message.warning(importDisabledReason || t('messages.importIntelligenceFailed'))
          return
        }
        void handleImportIntelligence(filePath)
      },
    })

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
              style={{ color: 'var(--warning)' }}
            />
          )}
          {!collapsed && (
            <div className="file-tree-panel-title">
              {state.workspacePath ? state.workspacePath.split('\\').pop() : t('title')}
            </div>
          )}
        </div>
        
        {!collapsed && (
          <div className="file-tree-search-bar">
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
                icon={renderTreeIcon}
                motion={false}
                draggable
                onDrop={handleDrop}
                treeData={filteredTreeData}
                titleRender={renderTreeTitle}
                onSelect={onSelect}
                selectedKeys={state.currentFile ? [state.currentFile] : []}
                expandedKeys={expandedKeys}
                onExpand={(_keys, { expanded, node }) => {
                  const nodeKey = String(node.key)
                  setUserExpandedKeys((current) => {
                    if (expanded) {
                      return current.some((key) => treePathsEqual(key, nodeKey))
                        ? current
                        : [...current, nodeKey]
                    }
                    return current.filter((key) => !treePathsEqual(key, nodeKey))
                  })
                  if (expanded && node.isLeaf === false) {
                    void loadNodeChildren(nodeKey)
                  }
                }}
                blockNode
                onRightClick={({ node, event }) => {
                  handleContextMenu(node, event as React.MouseEvent)
                }}
              />
            ) : (
              <div className="file-tree-empty">
                {state.workspacePath ? (
                  t('noMatchingFiles')
                ) : (
                  <>
                    <span className="file-tree-empty-icon" aria-hidden>📁</span>
                    <p style={{ margin: 0 }}>{t('pleaseOpenWorkspace')}</p>
                    {onOpenWorkspace && (
                      <Button type="primary" size="small" onClick={onOpenWorkspace}>
                        {t('openWorkspace')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {!collapsed && (
          <div className="file-tree-activity">
            <DailyNoteCalendar
              onOpenNote={handleOpenDailyNote}
              onOpenInGraph={onOpenInGraph}
              onEntryCreated={() => {
                if (state.workspacePath) void refreshExpandedTree()
              }}
            />
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
          pendingNewFileParentRef.current = null
          setPendingNewFileParentPath(null)
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
          pendingNewFolderParentRef.current = null
          setPendingNewFolderParentPath(null)
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
            workspaceIndexService.signalVaultItemCreated(templateTargetPath, filePath)
            const tabName = filePath.split(/[/\\]/).pop() || fileName
            dispatch({
              type: 'ADD_TAB',
              payload: { path: filePath, name: tabName, isDirty: false },
            })
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

