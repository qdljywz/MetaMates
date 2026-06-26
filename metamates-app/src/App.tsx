import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { ConfigProvider, Layout, theme, Spin, message, Modal, Input, Skeleton, Button, Result } from 'antd'
import { AppProvider, useAppContext } from './store/AppContext'
import { Panel, Group, Separator } from 'react-resizable-panels'
import TitleBar from './components/TitleBar'
import ActivityBar from './components/ActivityBar'
import FileTreePanel from './components/FileTreePanel'
import Editor from './components/Editor'
import PdfViewer from './components/PdfViewer'
import AgentChatPanel from './components/AgentChatPanel'
import ErrorBoundary from './components/ErrorBoundary'
import StatusBar from './components/StatusBar'
import TabBar from './components/TabBar'
import WelcomeWizard from './components/WelcomeWizard'
import DesktopOnlyGate from './components/DesktopOnlyGate'
import { storageService } from './services/storage'
import { Template } from './templates/definitions'
import { useTheme, ThemeProvider } from './hooks/useTheme'
import { useTranslation } from 'react-i18next'
import {
  getTodayDateString,
  getWorkspaceLanguage,
  openOrCreateDailyEntry,
  resolveInboxDirPath,
} from './constants/paths'
import { workspaceIndexService } from './services/workspaceIndex'
import { pickAndImportIntelligence } from './services/intelligenceImport'
import './App.css'

const CommandPalette = lazy(() => import('./components/CommandPalette'))
const GlobalSearch = lazy(() => import('./components/GlobalSearch'))
const GraphView = lazy(() => import('./components/GraphView'))
const TemplateSelector = lazy(() => import('./templates/TemplateSelector'))

const themeCache = new Map<string, Promise<void>>()
const loadThemeCSS = (themeName: string) => {
  if (themeName === 'default' || themeCache.has(themeName)) return
  const promise = import(`./themes/${themeName}.css`)
  themeCache.set(themeName, promise as unknown as Promise<void>)
  return promise
}

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 200 }}>
    <Spin />
  </div>
)

const ModalLoadingFallback = () => (
  <div style={{ padding: 24 }}>
    <Skeleton active paragraph={{ rows: 4 }} />
  </div>
)

const { Content } = Layout

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppContext()
  const { darkAlgorithm, defaultAlgorithm } = theme
  const { theme: appTheme, colorScheme } = useTheme()
  const { i18n, t } = useTranslation('common')
  const isDark = appTheme.mode === 'dark'
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)
  const [graphVisible, setGraphVisible] = useState(false)
  const [templateVisible, setTemplateVisible] = useState(false)
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [files, setFiles] = useState<{ name: string; path: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const lastWorkspacePathRef = useRef('')

  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false)

  useEffect(() => {
    const initApp = async () => {
      console.log('App initialized')
      console.log('electronAPI exists:', typeof window.electronAPI !== 'undefined')
      
      try {
        const settings = await storageService.getSettings()
        
        if (settings.language) {
          i18n.changeLanguage(settings.language)
          localStorage.setItem('metamates-language', settings.language)
        }
        
        if (settings.colorScheme && settings.colorScheme !== 'default') {
          loadThemeCSS(settings.colorScheme)
        }
        
        dispatch({ type: 'UPDATE_SETTINGS', payload: settings })

        const e2eBoot = (window as Window & { __METAMATES_E2E__?: { enabled?: boolean; workspace?: string } }).__METAMATES_E2E__
        if (e2eBoot?.enabled && e2eBoot.workspace && window.electronAPI) {
          const ws = e2eBoot.workspace
          console.log('[E2E] Bootstrapping workspace:', ws)
          await window.electronAPI.initWorkspace(ws, 'zh')
          await window.electronAPI.acp.setWorkspacePath(ws)
          dispatch({ type: 'SET_WORKSPACE', payload: ws })
          const lang: 'zh' | 'en' = settings.language?.startsWith('en') ? 'en' : 'zh'
          await storageService.saveSettings({
            workspacePath: ws,
            theme: settings.theme || 'default',
            fontSize: settings.fontSize || 14,
            language: lang,
          })
          setShowWizard(false)
          setShowWorkspaceSelector(false)
          setLoading(false)
          return
        }
        
        let workspaceRestored = false
        if (settings.workspacePath) {
          if (window.electronAPI) {
            const existsResult = await window.electronAPI.fileExists(settings.workspacePath)
            if (existsResult.exists) {
              console.log('恢复上次工作区:', settings.workspacePath)
              const lang = settings.language?.startsWith('en') ? 'en' : 'zh'
              await window.electronAPI.initWorkspace(settings.workspacePath, lang)
              dispatch({ type: 'SET_WORKSPACE', payload: settings.workspacePath })
              workspaceRestored = true
            } else {
              console.log('存储的工作区路径无效:', settings.workspacePath)
              setShowWorkspaceSelector(true)
            }
          } else {
            dispatch({ type: 'SET_WORKSPACE', payload: settings.workspacePath })
            workspaceRestored = true
          }
        }

        const hasSettings = settings.theme || settings.fontSize
        if (!hasSettings) {
          setShowWizard(true)
        } else if (!workspaceRestored && !settings.workspacePath) {
          setShowWorkspaceSelector(true)
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
        setShowWizard(true)
      }
      
      setLoading(false)
    }
    
    initApp()
  }, [dispatch, i18n])

  useEffect(() => {
    if (!state.workspacePath || !window.electronAPI) {
      if (window.electronAPI) {
        void window.electronAPI.syncWorkspacePath('').catch(() => {})
      }
      workspaceIndexService.detach()
      setFiles([])
      setWorkspaceLoading(false)
      lastWorkspacePathRef.current = ''
      return
    }

    const isSwitch = Boolean(lastWorkspacePathRef.current && lastWorkspacePathRef.current !== state.workspacePath)
    const shortName = state.workspacePath.split(/[/\\]/).pop() || state.workspacePath
    lastWorkspacePathRef.current = state.workspacePath
    setWorkspaceLoading(true)

    if (isSwitch) {
      message.loading({
        content: t('appShell.workspaceSwitching', { name: shortName }),
        key: 'workspace-switch',
        duration: 0,
      })
      if (!sessionStorage.getItem('metamates-workspace-chat-hint')) {
        message.info(t('appShell.workspaceChatHint'), 5)
        sessionStorage.setItem('metamates-workspace-chat-hint', '1')
      }
    }

    let cancelled = false

    void window.electronAPI.syncWorkspacePath(state.workspacePath).catch((err: unknown) => {
      console.warn('[App] syncWorkspacePath failed:', err)
    })

    void workspaceIndexService.attachWorkspace(state.workspacePath).then(() => {
      if (cancelled) return
      setFiles(workspaceIndexService.getAllFiles())
      setWorkspaceLoading(false)
      if (isSwitch) {
        message.success({
          content: t('appShell.workspaceReady', { name: shortName }),
          key: 'workspace-switch',
          duration: 2,
        })
      }
    })

    const syncFiles = () => {
      setFiles(workspaceIndexService.getAllFiles())
    }
    syncFiles()
    const unsubscribe = workspaceIndexService.subscribe(() => {
      syncFiles()
    })

    const syncVaultApi = async () => {
      const settings = await storageService.getSettings()
      if (settings.vaultApiEnabled) {
        await window.electronAPI!.vaultApi.start(
          state.workspacePath,
          settings.vaultApiPort || 17333,
          settings.calendarIcsPath,
          !!settings.vaultApiLanAccess
        )
      }
    }
    void syncVaultApi()

    return () => {
      cancelled = true
      unsubscribe()
      workspaceIndexService.detach()
    }
  }, [state.workspacePath, t])

  useEffect(() => {
    if (colorScheme && colorScheme !== 'default') {
      loadThemeCSS(colorScheme)
    }
  }, [colorScheme])

  const handleCreateDailyNote = useCallback(async () => {
    if (!window.electronAPI || !state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }

    const language = getWorkspaceLanguage(i18n.language)
    const dateStr = getTodayDateString()
    const result = await openOrCreateDailyEntry(state.workspacePath, dateStr, 'note', language)
    if (!result) {
      message.error(t('appShell.dailyNoteFailed'))
      return
    }

    dispatch({ type: 'ADD_TAB', payload: { path: result.path, name: result.name, isDirty: false } })
    setRefreshKey((prev) => prev + 1)
    message[result.created ? 'success' : 'info'](
      result.created
        ? t('appShell.dailyNoteCreated', { date: dateStr })
        : t('appShell.dailyNoteOpened', { date: dateStr })
    )
  }, [state.workspacePath, dispatch, i18n.language, t])

  const handleCreateDailyPlan = useCallback(async () => {
    if (!window.electronAPI || !state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }

    const language = getWorkspaceLanguage(i18n.language)
    const dateStr = getTodayDateString()
    const result = await openOrCreateDailyEntry(state.workspacePath, dateStr, 'plan', language)
    if (!result) {
      message.error(t('appShell.dailyPlanFailed'))
      return
    }

    dispatch({ type: 'ADD_TAB', payload: { path: result.path, name: result.name, isDirty: false } })
    setRefreshKey((prev) => prev + 1)
    message[result.created ? 'success' : 'info'](
      result.created
        ? t('appShell.dailyPlanCreated', { date: dateStr })
        : t('appShell.dailyPlanOpened', { date: dateStr })
    )
  }, [state.workspacePath, dispatch, i18n.language, t])

  const handleImportIntelligence = useCallback(async () => {
    if (!window.electronAPI || !state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }
    const language = getWorkspaceLanguage(i18n.language)
    const hide = message.loading(t('appShell.importIntelligenceRunning'), 0)
    try {
      const result = await pickAndImportIntelligence(state.workspacePath, language)
      if (result.error === 'canceled') return
      if (!result.success || !result.notePath) {
        message.error(result.error || t('appShell.importIntelligenceFailed'))
        return
      }
      dispatch({
        type: 'ADD_TAB',
        payload: { path: result.notePath, name: result.noteName || 'intel.md', isDirty: false },
      })
      setRefreshKey((prev) => prev + 1)
      message.success(t('appShell.importIntelligenceSuccess', { name: result.noteName }))
      if (result.warnings?.length) {
        message.warning(result.warnings.join('；'))
      }
    } finally {
      hide()
    }
  }, [state.workspacePath, dispatch, i18n.language, t])

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        setCommandPaletteVisible((prev) => !prev)
        return
      }

      if (isTypingTarget(e.target)) return

      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault()
        setGlobalSearchVisible(true)
        return
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        void handleCreateDailyNote()
        return
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault()
        void handleCreateDailyPlan()
        return
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        setFileTreeCollapsed((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleCreateDailyNote, handleCreateDailyPlan])

  const openFileInTab = useCallback((filePath: string, name?: string) => {
    const fileName = name || filePath.split(/[/\\]/).pop() || filePath
    dispatch({ type: 'ADD_TAB', payload: { path: filePath, name: fileName, isDirty: false } })
  }, [dispatch])

  const createNoteFile = useCallback(async (baseName?: string) => {
    if (!window.electronAPI || !state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }

    const language = getWorkspaceLanguage(i18n.language)
    const inboxPath = await resolveInboxDirPath(state.workspacePath, language)
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
    const defaultStem = t('appShell.newNoteDefaultName', { date: dateStr, time: timeStr })
    const stem = (baseName?.trim() || defaultStem).replace(/\.md$/i, '')
    const fileName = stem.endsWith('.md') ? stem : `${stem}.md`
    const filePath = await window.electronAPI.path.join(inboxPath, fileName)

    const existsResult = await window.electronAPI.fileExists(filePath)
    if (existsResult.exists) {
      openFileInTab(filePath, fileName)
      message.info(t('appShell.fileOpened', { name: fileName }))
      return
    }

    const heading = stem.replace(/_/g, ' ')
    const result = await window.electronAPI.writeFile(filePath, `# ${heading}\n\n`)
    if (result.success) {
      openFileInTab(filePath, fileName)
      setRefreshKey((prev) => prev + 1)
      message.success(t('appShell.fileCreated', { name: fileName }))
    } else {
      message.error(t('appShell.fileCreateFailed', { error: result.error }))
    }
  }, [state.workspacePath, i18n.language, openFileInTab, t])

  const handleFileSelect = useCallback((path: string) => {
    const name = path.split(/[/\\]/).pop() || path
    openFileInTab(path, name)
  }, [openFileInTab])

  const handleCreateFile = useCallback(async (name: string) => {
    await createNoteFile(name)
  }, [createNoteFile])

  const openSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('metamates:open-settings'))
  }, [])

  const handleShowTags = useCallback(() => {
    if (!state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }
    dispatch({ type: 'FOCUS_EDITOR_SIDEBAR', payload: 'tags' })
  }, [state.workspacePath, dispatch, t])

  const handleShowGraph = useCallback(() => {
    setGraphVisible(true)
  }, [])

  const selectWorkspace = async () => {
    if (!window.electronAPI) {
      alert(t('appShell.desktopOnly'))
      return
    }

    const result = await window.electronAPI.selectDirectory()
    if (!result.canceled && result.filePaths.length > 0) {
      const path = result.filePaths[0]
      const lang = i18n.language?.startsWith('en') ? 'en' : 'zh'
      await window.electronAPI.initWorkspace(path, lang)
      dispatch({ type: 'SET_WORKSPACE', payload: path })
      await storageService.saveSettings({ workspacePath: path })
      setShowWorkspaceSelector(false)
    }
  }

  const handleWorkspaceFromWizard = useCallback(async (path: string) => {
    dispatch({ type: 'SET_WORKSPACE', payload: path })
    await storageService.saveSettings({ workspacePath: path })
    setShowWorkspaceSelector(false)
  }, [dispatch])

  const createNewNote = async () => {
    await createNoteFile()
  }

  const createNewFolder = async () => {
    if (!window.electronAPI || !state.workspacePath) return
    
    setNewFolderModalVisible(true)
  }

  const handleCreateFolder = async () => {
    if (!window.electronAPI || !state.workspacePath || !newFolderName.trim()) return
    
    const folderPath = await window.electronAPI.path.join(state.workspacePath, newFolderName.trim())
    
    const result = await window.electronAPI.createDirectory(folderPath)
    
    if (result.success) {
      setRefreshKey(prev => prev + 1)
      message.success(t('appShell.folderCreated', { name: newFolderName }))
      setNewFolderModalVisible(false)
      setNewFolderName('')
    } else {
      message.error(t('appShell.folderCreateFailed', { error: result.error }))
    }
  }

  const openTemplateSelector = () => {
    if (!state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }
    setTemplateVisible(true)
  }

  const openCommandPalette = () => {
    setCommandPaletteVisible(true)
  }

  const openGraph = () => {
    if (!state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }
    setGraphVisible(true)
  }

  const openSearch = () => {
    setGlobalSearchVisible(true)
  }

  const toggleFileTree = () => {
    setFileTreeCollapsed(!fileTreeCollapsed)
  }

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false)
    void handleCreateDailyNote()
  }, [handleCreateDailyNote])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#18181b' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!window.electronAPI) {
    const inElectronShell = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
    if (inElectronShell) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#18181b', padding: 24 }}>
          <Result
            status="error"
            title={t('desktop:preloadFailedTitle', { defaultValue: '桌面壳加载失败' })}
            subTitle={t('desktop:preloadFailedSubtitle', { defaultValue: 'Electron 窗口已打开，但 preload 未注入。请完全退出后重新运行 npm run electron:dev。' })}
          />
        </div>
      )
    }
    return <DesktopOnlyGate />
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#ff8c28' : '#ff7a00',
          colorBgContainer: isDark ? '#1c1c1f' : '#ffffff',
          colorBgElevated: isDark ? '#202024' : '#ffffff',
          colorText: isDark ? '#fafafa' : '#09090b',
          colorTextSecondary: isDark ? '#d4d4d8' : '#3f3f46',
          colorBorder: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)',
        },
      }}
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#18181b' }}>
        <TitleBar />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <ActivityBar
            workspacePath={state.workspacePath}
            onOpenWorkspace={selectWorkspace}
            onCreateNote={createNewNote}
            onCreateFolder={createNewFolder}
            onOpenTemplate={openTemplateSelector}
            onOpenCommandPalette={openCommandPalette}
            onOpenGraph={openGraph}
            onOpenSearch={openSearch}
            onToggleFileTree={toggleFileTree}
            fileTreeCollapsed={fileTreeCollapsed}
          />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {!fileTreeCollapsed && (
              <div style={{ width: 280, minWidth: 280, flexShrink: 0 }}>
                <FileTreePanel
                  collapsed={fileTreeCollapsed}
                  refreshKey={refreshKey}
                  workspaceLoading={workspaceLoading}
                />
              </div>
            )}
            <Group orientation="horizontal" style={{ flex: 1 }}>
              <Panel defaultSize={60} minSize={20}>
                <div className="editor-area" style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  background: '#1c1c1f',
                }}>
                  <TabBar />
                  {state.currentFile?.toLowerCase().endsWith('.pdf') ? (
                    <PdfViewer filePath={state.currentFile} />
                  ) : (
                    <Editor filePath={state.currentFile ?? undefined} />
                  )}
                </div>
              </Panel>
              <Separator style={{ width: '8px', background: 'rgba(255, 255, 255, 0.06)' }} />
              <Panel defaultSize={40} minSize={20}>
                <div style={{
                  height: '100%',
                  background: '#1c1c1f',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}>
                  <ErrorBoundary>
                    <AgentChatPanel />
                </ErrorBoundary>
                </div>
              </Panel>
            </Group>
          </div>
        </div>
        <StatusBar 
          workspacePath={state.workspacePath}
          currentFile={state.currentFile ?? undefined}
          onCreateDailyNote={handleCreateDailyNote}
          onCreateDailyPlan={handleCreateDailyPlan}
        />
        <Suspense fallback={<ModalLoadingFallback />}>
          <CommandPalette 
            visible={commandPaletteVisible}
            onClose={() => setCommandPaletteVisible(false)}
            files={files}
            onFileSelect={handleFileSelect}
            onCreateFile={handleCreateFile}
            onShowTags={handleShowTags}
            onShowGraph={handleShowGraph}
            onCreateDailyNote={handleCreateDailyNote}
            onCreateDailyPlan={handleCreateDailyPlan}
            onOpenSettings={openSettings}
            onImportIntelligence={handleImportIntelligence}
          />
        </Suspense>
        <WelcomeWizard
          visible={showWizard}
          workspacePath={state.workspacePath}
          onComplete={handleWizardComplete}
          onWorkspaceSelected={handleWorkspaceFromWizard}
        />
        <Suspense fallback={<ModalLoadingFallback />}>
          <GlobalSearch 
            visible={globalSearchVisible}
            onClose={() => setGlobalSearchVisible(false)}
          />
        </Suspense>
        <Suspense fallback={<ModalLoadingFallback />}>
          <GraphView
            visible={graphVisible}
            onClose={() => setGraphVisible(false)}
            workspacePath={state.workspacePath || ''}
            onFileSelect={(path) => {
              const name = path.split(/[/\\]/).pop() || path
              dispatch({ type: 'ADD_TAB', payload: { path, name, isDirty: false } })
            }}
          />
        </Suspense>
        <Suspense fallback={<ModalLoadingFallback />}>
          <TemplateSelector
            visible={templateVisible}
            onClose={() => setTemplateVisible(false)}
            onSelect={async (content: string, template: Template, fixedFileName?: string) => {
              if (!window.electronAPI || !state.workspacePath) return
              
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
                  message.info(t('appShell.fileOpened', { name: fileName }))
                  setTemplateVisible(false)
                  return
                }
              } else {
                const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
                fileName = `${template.name}_${dateStr}_${timeStr}.md`
                filePath = await window.electronAPI.path.join(state.workspacePath, fileName)
              }
              
              const result = await window.electronAPI.writeFile(filePath, content)
              
              if (result.success) {
                setRefreshKey(prev => prev + 1)
                dispatch({ type: 'SET_CURRENT_FILE', payload: filePath })
                message.success(t('appShell.fileCreated', { name: fileName }))
              } else {
                message.error(t('appShell.fileCreateFailed', { error: result.error }))
              }
              
              setTemplateVisible(false)
            }}
          />
        </Suspense>
        <Modal
          title={t('appShell.newFolderTitle')}
          open={newFolderModalVisible}
          onCancel={() => {
            setNewFolderModalVisible(false)
            setNewFolderName('')
          }}
          onOk={handleCreateFolder}
          okText={t('actions.create')}
          cancelText={t('actions.cancel')}
        >
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder={t('appShell.newFolderPlaceholder')}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onPressEnter={handleCreateFolder}
              autoFocus
            />
          </div>
        </Modal>
        <Modal
          title={t('appShell.selectWorkspaceTitle')}
          open={showWorkspaceSelector}
          closable={false}
          maskClosable={false}
          footer={null}
          width={480}
        >
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
            <h3 style={{ marginBottom: 8 }}>{t('appShell.selectWorkspaceTitle')}</h3>
            <p style={{ color: '#888', marginBottom: 24 }}>
              {t('appShell.selectWorkspaceDesc')}
            </p>
            <Button type="primary" size="large" onClick={selectWorkspace}>
              {t('appShell.selectWorkspaceButton')}
            </Button>
          </div>
        </Modal>
      </div>
    </ConfigProvider>
  )
}

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  )
}

export default App
