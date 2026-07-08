import React, { useCallback, useMemo, useState } from 'react'
import { Button, Tooltip, Modal, Input, message } from 'antd'
import type { MenuProps } from 'antd'
import {
  CloseOutlined,
  FileOutlined,
  FolderOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../store/AppContext'
import type { OpenTab } from '../store/appStore'
import { useTheme } from '../hooks/useTheme'
import { getWorkspaceLanguage } from '../constants/paths'
import { isImportableDocument } from '../../electron/shared/importableFormats'
import { importDocumentAsIntelligence } from '../services/intelligenceImport'
import { workspaceIndexService } from '../services/workspaceIndex'
import { treePathsEqual } from '../utils/fileTreeExpand'
import { maybeCloseTab } from '../utils/tabClose'
import ContextMenu from './ContextMenu'

const TabBar: React.FC = () => {
  const { t: tEditor } = useTranslation('editor')
  const { t: tCommon } = useTranslation('common')
  const { t: tSidebar, i18n } = useTranslation('sidebar')
  const { state, dispatch } = useAppContext()
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'

  const [contextTab, setContextTab] = useState<OpenTab | null>(null)
  const [menuVisible, setMenuVisible] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)

  const closeMenu = useCallback(() => {
    setMenuVisible(false)
    setContextTab(null)
  }, [])

  const handleTabClick = (path: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: path })
  }

  const handleTabClose = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    const ok = await maybeCloseTab(state.openTabs, path, tEditor, tCommon)
    if (!ok) return
    dispatch({ type: 'CLOSE_TAB', payload: path })
    if (state.openTabs.length === 1 && treePathsEqual(state.currentFile ?? '', path)) {
      dispatch({ type: 'SET_CURRENT_FILE', payload: null })
    }
  }

  const handleTabContextMenu = (e: React.MouseEvent, tab: OpenTab) => {
    e.preventDefault()
    e.stopPropagation()
    setContextTab(tab)
    setMenuPosition({ x: e.clientX, y: e.clientY })
    setMenuVisible(true)
  }

  const handleRename = useCallback(async () => {
    if (!contextTab || !window.electronAPI || !renameValue.trim()) return
    const oldPath = contextTab.path
    const parentDir = await window.electronAPI.path.dirname(oldPath)
    const ext = oldPath.toLowerCase().endsWith('.md') ? '.md' : ''
    const newPath = await window.electronAPI.path.join(parentDir, `${renameValue.trim()}${ext}`)
    if (oldPath === newPath) {
      setRenameOpen(false)
      return
    }
    const result = await window.electronAPI.renameFile(oldPath, newPath)
    if (!result.success) {
      message.error(result.error || tSidebar('messages.renameSuccess'))
      return
    }
    const newName = renameValue.trim() + ext
    dispatch({ type: 'RENAME_TAB', payload: { oldPath, newPath, newName } })
    if (state.currentFile === oldPath) {
      dispatch({ type: 'SET_CURRENT_FILE', payload: newPath })
    }
    await workspaceIndexService.signalVaultTreeChange(oldPath)
    await workspaceIndexService.signalVaultTreeChange(newPath)
    message.success(tSidebar('messages.renameSuccess'))
    setRenameOpen(false)
    closeMenu()
  }, [contextTab, renameValue, dispatch, state.currentFile, tSidebar, closeMenu])

  const handleDelete = useCallback(async () => {
    if (!contextTab || !window.electronAPI) return
    const filePath = contextTab.path
    const result = await window.electronAPI.deleteFile(filePath)
    if (!result.success) {
      message.error(tSidebar('messages.deleteFailed') + (result.error ? `: ${result.error}` : ''))
      return
    }
    dispatch({ type: 'CLOSE_TAB', payload: filePath })
    if (state.currentFile === filePath) {
      dispatch({ type: 'SET_CURRENT_FILE', payload: null })
    }
    await workspaceIndexService.signalVaultTreeChange(filePath)
    message.info(result.alreadyGone ? tSidebar('messages.deleteAlreadyGone') : tSidebar('messages.deleteSuccess'))
    setDeleteOpen(false)
    closeMenu()
  }, [contextTab, dispatch, state.currentFile, tSidebar, closeMenu])

  const handleImportIntelligence = useCallback(async (filePath: string) => {
    if (!state.workspacePath || !window.electronAPI) {
      message.warning(tSidebar('pleaseOpenWorkspaceFirst'))
      return
    }
    setImportLoading(true)
    closeMenu()
    const hide = message.loading(tSidebar('messages.importIntelligenceRunning'), 0)
    try {
      const result = await importDocumentAsIntelligence(
        state.workspacePath,
        filePath,
        getWorkspaceLanguage(i18n.language),
      )
      if (result.error === 'canceled') return
      if (!result.success || !result.notePath) {
        message.error(result.error || tSidebar('messages.importIntelligenceFailed'))
        return
      }
      dispatch({
        type: 'ADD_TAB',
        payload: { path: result.notePath, name: result.noteName || 'intel.md', isDirty: false },
      })
      message.success(tSidebar('messages.importIntelligenceSuccess', { name: result.noteName }))
    } finally {
      hide()
      setImportLoading(false)
    }
  }, [state.workspacePath, dispatch, tSidebar, closeMenu, i18n.language])

  const contextMenuItems = useMemo((): MenuProps['items'] => {
    if (!contextTab) return []
    const tab = contextTab
    const isMarkdown = tab.path.toLowerCase().endsWith('.md')

    const items: MenuProps['items'] = [
      {
        key: 'close',
        label: tEditor('tabs.close'),
        icon: <CloseOutlined />,
        onClick: () => {
          dispatch({ type: 'CLOSE_TAB', payload: tab.path })
          closeMenu()
        },
      },
      {
        key: 'closeOthers',
        label: tEditor('tabs.closeOthers'),
        disabled: state.openTabs.length <= 1,
        onClick: () => {
          dispatch({ type: 'CLOSE_OTHER_TABS', payload: tab.path })
          closeMenu()
        },
      },
      {
        key: 'closeAll',
        label: tEditor('tabs.closeAll'),
        onClick: () => {
          dispatch({ type: 'CLOSE_ALL_TABS' })
          closeMenu()
        },
      },
      { type: 'divider' },
      {
        key: 'copyPath',
        label: tSidebar('contextMenu.copyPath'),
        icon: <CopyOutlined />,
        onClick: () => {
          void navigator.clipboard.writeText(tab.path)
          message.success(tSidebar('messages.copySuccess'))
          closeMenu()
        },
      },
      {
        key: 'openInExplorer',
        label: tSidebar('contextMenu.openInExplorer'),
        icon: <FolderOpenOutlined />,
        onClick: () => {
          void window.electronAPI?.openInExplorer(tab.path)
          closeMenu()
        },
      },
    ]

    if (isImportableDocument(tab.path)) {
      items.push({
        key: 'importIntelligence',
        label: tSidebar('contextMenu.importIntelligence'),
        icon: <ImportOutlined />,
        disabled: importLoading,
        onClick: () => {
          void handleImportIntelligence(tab.path)
        },
      })
    }

    if (isMarkdown) {
      items.push(
        { type: 'divider' },
        {
          key: 'rename',
          label: tSidebar('contextMenu.rename'),
          icon: <EditOutlined />,
          onClick: () => {
            setRenameValue(tab.name.replace(/\.md$/i, ''))
            setRenameOpen(true)
            setMenuVisible(false)
          },
        },
        {
          key: 'delete',
          label: tSidebar('contextMenu.delete'),
          icon: <DeleteOutlined />,
          danger: true,
          onClick: () => {
            setDeleteOpen(true)
            setMenuVisible(false)
          },
        },
      )
    }

    return items
  }, [
    contextTab,
    closeMenu,
    dispatch,
    handleImportIntelligence,
    importLoading,
    state.openTabs.length,
    tEditor,
    tSidebar,
  ])

  if (state.openTabs.length === 0) {
    return (
      <div
        className="tab-bar tab-bar--empty"
        data-testid="tab-bar"
        role="tablist"
        aria-label={tEditor('tabs.listLabel')}
        style={{
          display: 'flex',
          alignItems: 'center',
          background: isDark ? '#181825' : '#f5f5f5',
          borderBottom: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
          padding: '0 12px',
          minHeight: 36,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: isDark ? '#6c7086' : '#9ca3af' }}>
          {tEditor('tabs.emptyPlaceholder')}
        </span>
      </div>
    )
  }

  return (
    <>
      <div
        className="tab-bar"
        data-testid="tab-bar"
        role="tablist"
        aria-label={tEditor('tabs.listLabel')}
        style={{
          display: 'flex',
          background: isDark ? '#181825' : '#f5f5f5',
          borderBottom: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
          padding: '4px 8px 0',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {state.openTabs.map((tab: OpenTab) => {
          const isActive = treePathsEqual(tab.path, state.currentFile ?? '')
          const isFolder = !tab.path.endsWith('.md')

          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={isActive ? 'tab-bar__tab tab-bar__tab--active' : 'tab-bar__tab'}
              onClick={() => handleTabClick(tab.path)}
              onContextMenu={(e) => handleTabContextMenu(e, tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                marginRight: '2px',
                background: isActive ? undefined : (isDark ? '#11111b' : '#e5e7eb'),
                borderRadius: '6px 6px 0 0',
                cursor: 'pointer',
                border: isActive ? undefined : '1px solid transparent',
                borderBottom: isActive ? undefined : 'none',
                marginBottom: '-1px',
                minWidth: '100px',
                maxWidth: '200px',
                transition: 'all 0.2s',
              }}
            >
              {isFolder ? (
                <FolderOutlined style={{ marginRight: 6, color: '#f59e0b' }} />
              ) : (
                <FileOutlined style={{ marginRight: 6, color: '#3b82f6' }} />
              )}
              <Tooltip title={tab.name} placement="bottom">
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 13,
                    color: isActive ? undefined : (isDark ? '#e6e6e6' : '#1f2937'),
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {tab.name}
                </span>
              </Tooltip>
              {tab.isDirty && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#3b82f6',
                    marginLeft: 6,
                  }}
                />
              )}
              <Button
                type="text"
                size="small"
                data-testid="tab-close"
                icon={<CloseOutlined style={{ fontSize: 10 }} />}
                onClick={(e) => handleTabClose(e, tab.path)}
                style={{
                  marginLeft: 6,
                  padding: '0 4px',
                  height: 18,
                  width: 18,
                  minWidth: 18,
                }}
              />
            </div>
          )
        })}
      </div>

      <ContextMenu
        visible={menuVisible}
        x={menuPosition.x}
        y={menuPosition.y}
        items={contextMenuItems}
        onClose={closeMenu}
      />

      <Modal
        title={tSidebar('actions.rename')}
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={() => void handleRename()}
        okText={tSidebar('actions.confirm')}
        cancelText={tSidebar('actions.cancel')}
        destroyOnClose
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={() => void handleRename()}
          autoFocus
        />
      </Modal>

      <Modal
        title={tSidebar('confirmDelete')}
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onOk={() => void handleDelete()}
        okText={tSidebar('actions.delete')}
        cancelText={tSidebar('actions.cancel')}
        okButtonProps={{ danger: true }}
      >
        <p>{tSidebar('deleteConfirmMessage')} {contextTab?.name}？</p>
      </Modal>
    </>
  )
}

export default TabBar
