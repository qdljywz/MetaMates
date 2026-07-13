import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { ConfigProvider, theme, Spin, message, Modal, Input, Button, Result } from 'antd'
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
import EngineSetupFlow from './components/EngineSetupFlow'
import StartupSplash from './components/StartupSplash'
import DesktopOnlyGate from './components/DesktopOnlyGate'
import { storageService } from './services/storage'
import { Template } from './templates/definitions'
import { useTheme, ThemeProvider } from './hooks/useTheme'
import { useAppShellHeight } from './hooks/useAppShellHeight'
import { useTranslation } from 'react-i18next'
import {
  getTodayDateString,
  getWorkspaceLanguage,
  openOrCreateDailyEntry,
  resolveInboxDirPath,
  resolveUserTimezone,
  isShippedTemplateWorkspace,
} from './constants/paths'
import { workspaceIndexService } from './services/workspaceIndex'
import { registerE2EBridge } from './e2e/e2eBridge'
import { pruneMissingOpenTabs } from './utils/openSlashWriteback'
import { pickAndImportIntelligence } from './services/intelligenceImport'
import { detectPluginInstallRequired } from './utils/pluginInstallPrompt'
import { openPluginInstallToast } from './utils/openPluginInstallToast'
import type { GraphViewMode } from './utils/graphFocus'
import { acknowledgeYoloMode } from './utils/yoloAcknowledgment'
import { waitForStartupGate } from './utils/startupGate'
import { treePathsEqual } from './utils/fileTreeExpand'
import { maybeCloseTab, confirmAllDirtyTabsClosed } from './utils/tabClose'
import { useEmptyStateBackgroundPlanner } from './hooks/useEmptyStatePlanner'
import {
  STARTUP_FORCE_ENTER_MS,
  STARTUP_MIN_WHEN_SKIP_AGENT_MS,
  STARTUP_SKIP_AGENT_WAIT,
  shouldCloseWorkspacePicker,
  shouldOpenWorkspacePicker,
  shouldShowWelcomeWizard,
  hasOnboardingSettings,
  waitStartupCapMs,
  markSplashMounted,
  waitUntilSplashEnter,
} from './utils/startupUx'
import { applyThemeBootstrapToDocument } from './utils/themeBootstrap'
import { shouldShowEngineSetup, engineSetupReadyPatch, engineSetupPendingPatch, vaultReminderSessionKey } from './utils/engineSetupPolicy'
import { detectHasUsableAgent } from './utils/engineSetupDetect'
import {
  preloadAgentDuringSplash,
  prefetchLazyAppChunks,
  preloadFileTreeDuringSplash,
  preloadWorkspaceDuringSplash,
  wasStartupIndexAttached,
} from './utils/startupPreload'
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

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppContext()
  useAppShellHeight()
  const { darkAlgorithm, defaultAlgorithm } = theme
  const { theme: appTheme, colorScheme, toggleTheme } = useTheme()
  const { i18n, t } = useTranslation('common')
  const { t: tEditor } = useTranslation('editor')
  const isDark = appTheme.mode === 'dark'
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [showEngineSetup, setShowEngineSetup] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)
  const [graphVisible, setGraphVisible] = useState(false)
  const [graphLaunchContext, setGraphLaunchContext] = useState<{
    highlightPaths?: string[]
    activityDateLabel?: string
    initialViewMode?: GraphViewMode
  } | null>(null)
  const [templateVisible, setTemplateVisible] = useState(false)
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFileModalVisible, setNewFileModalVisible] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [files, setFiles] = useState<{ name: string; path: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const lastWorkspacePathRef = useRef('')
  const openTabsRef = useRef(state.openTabs)
  openTabsRef.current = state.openTabs
  useEmptyStateBackgroundPlanner(state.workspacePath)
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false)

  useEffect(() => {
    const px = state.settings.fontSize || 14
    document.documentElement.style.setProperty('--app-font-size', `${px}px`)
  }, [state.settings.fontSize])

  // LOCKED: splash exits at exactly STARTUP_FORCE_ENTER_MS from mount — not when preloads finish early.
  useEffect(() => {
    markSplashMounted()
    document.documentElement.classList.add('startup-phase')
    applyThemeBootstrapToDocument()
    const forceEnterTimer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('[Startup] force-enter triggered after', STARTUP_FORCE_ENTER_MS, 'ms')
        }
        return false
      })
    }, STARTUP_FORCE_ENTER_MS)
    return () => {
      window.clearTimeout(forceEnterTimer)
      document.documentElement.classList.remove('startup-phase')
    }
  }, [])

  useEffect(() => {
    return registerE2EBridge({
      workspacePath: state.workspacePath,
      language: i18n.language,
      dispatch,
      setAutoSave: (enabled) => {
        dispatch({ type: 'UPDATE_SETTINGS', payload: { autoSave: enabled } })
      },
      onExternalFileRemoved: async (filePath) => {
        await workspaceIndexService.signalVaultItemDeleted(filePath)
      },
    })
  }, [state.workspacePath, i18n.language, dispatch])

  useEffect(() => {
    if (!state.workspacePath) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = workspaceIndexService.onVaultChanged(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void pruneMissingOpenTabs({
          workspacePath: state.workspacePath!,
          tabPaths: openTabsRef.current.map((tab) => tab.path),
          dispatch,
        })
      }, 300)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [state.workspacePath, dispatch])

  useEffect(() => {
    let cancelled = false

    const initApp = async () => {
      console.log('App initialized')
      console.log('electronAPI exists:', typeof window.electronAPI !== 'undefined')
      prefetchLazyAppChunks()

      let settings = await storageService.getSettings().catch(() => ({} as Awaited<ReturnType<typeof storageService.getSettings>>))
      let workspaceRestored = false
      let restoredWorkspacePath = ''
      let needsWizard = false
      let needsWorkspacePicker = false
      const e2eBoot = (window as Window & { __METAMATES_E2E__?: { enabled?: boolean; workspace?: string } }).__METAMATES_E2E__
      const applyStartupDecision = () => {
        if (workspaceRestored) {
          setShowWizard(false)
          setShowWorkspaceSelector(false)
          return
        }
        const openWorkspacePicker = shouldOpenWorkspacePicker(needsWorkspacePicker, workspaceRestored)
        setShowWorkspaceSelector(openWorkspacePicker)
        setShowWizard(!openWorkspacePicker && needsWizard)
      }
      
      try {
        
        if (settings.language) {
          i18n.changeLanguage(settings.language)
          localStorage.setItem('metamates-language', settings.language)
        }
        
        if (settings.colorScheme && settings.colorScheme !== 'default') {
          loadThemeCSS(settings.colorScheme)
        }
        
        dispatch({ type: 'UPDATE_SETTINGS', payload: settings })

        if (e2eBoot?.enabled && e2eBoot.workspace && window.electronAPI) {
          const ws = e2eBoot.workspace
          console.log('[E2E] Bootstrapping workspace:', ws)
          acknowledgeYoloMode()
          await storageService.saveSettings({
            workspacePath: ws,
            theme: 'dark',
            fontSize: 14,
            autoSave: true,
            language: 'zh',
            engineSetupStatus: 'ready',
          })
          dispatch({ type: 'SET_WORKSPACE', payload: ws })
          restoredWorkspacePath = ws
          setShowWizard(false)
          setShowWorkspaceSelector(false)
          const splashPreloads = Promise.all([
            preloadWorkspaceDuringSplash(ws, { ...settings, language: 'zh', workspacePath: ws }),
            preloadFileTreeDuringSplash(ws),
            waitForStartupGate({ minMs: 800, maxMs: 4_000, skipAgentWait: true }),
          ])
          void splashPreloads.then(() => {
            void preloadAgentDuringSplash(settings.lastAgentBackend)
          })
          await Promise.race([splashPreloads, waitStartupCapMs(STARTUP_FORCE_ENTER_MS)])
          if (!cancelled) {
            applyThemeBootstrapToDocument()
            await waitUntilSplashEnter()
            if (!cancelled) setLoading(false)
          }
          return
        }
        
        if (settings.workspacePath) {
          if (isShippedTemplateWorkspace(settings.workspacePath)) {
            console.warn('[App] Ignoring shipped template as workspace:', settings.workspacePath)
            await storageService.saveSettings({ workspacePath: '' })
            needsWorkspacePicker = true
          } else if (window.electronAPI) {
            const existsResult = await window.electronAPI.fileExists(settings.workspacePath)
            if (existsResult.exists) {
              console.log('恢复上次工作区:', settings.workspacePath)
              dispatch({ type: 'SET_WORKSPACE', payload: settings.workspacePath })
              restoredWorkspacePath = settings.workspacePath
              workspaceRestored = true
              setShowWizard(false)
              setShowWorkspaceSelector(false)
            } else {
              console.log('存储的工作区路径无效:', settings.workspacePath)
              needsWorkspacePicker = true
            }
          } else {
            dispatch({ type: 'SET_WORKSPACE', payload: settings.workspacePath })
            workspaceRestored = true
          }
        }

        const hasSettings = hasOnboardingSettings(settings)
        if (shouldShowWelcomeWizard({
          hasOnboardingSettings: hasSettings,
          workspaceRestored,
          workspacePath: settings.workspacePath,
        })) {
          needsWizard = true
        } else if (!workspaceRestored && !settings.workspacePath) {
          needsWorkspacePicker = true
        } else if (!workspaceRestored && settings.workspacePath) {
          needsWorkspacePicker = true
        } else if (!hasSettings) {
          await storageService.saveSettings({
            theme: 'dark',
            fontSize: 14,
            autoSave: true,
            language: settings.language?.startsWith('en') ? 'en' : 'zh',
          })
        }

        applyStartupDecision()
      } catch (error) {
        console.error('Failed to load settings:', error)
        if (e2eBoot?.enabled) {
          needsWorkspacePicker = false
          needsWizard = false
          applyStartupDecision()
        } else {
        const hasWorkspacePath = Boolean(settings.workspacePath?.trim())
        if (hasWorkspacePath) {
          needsWorkspacePicker = true
          needsWizard = false
        } else {
          needsWizard = !hasOnboardingSettings(settings)
          needsWorkspacePicker = !needsWizard
        }
        applyStartupDecision()
        }
      }

      const runGate = waitForStartupGate({
        minMs: STARTUP_MIN_WHEN_SKIP_AGENT_MS,
        preferredBackend: settings.lastAgentBackend,
        skipAgentWait: STARTUP_SKIP_AGENT_WAIT,
      })

      let gate
      if (restoredWorkspacePath && window.electronAPI) {
        const gatePromise = runGate
        const splashPreloads = Promise.all([
          preloadWorkspaceDuringSplash(restoredWorkspacePath, settings),
          preloadFileTreeDuringSplash(restoredWorkspacePath),
          gatePromise,
        ])
        void splashPreloads.then(() => {
          void preloadAgentDuringSplash(settings.lastAgentBackend)
        })
        await Promise.race([splashPreloads, waitStartupCapMs(STARTUP_FORCE_ENTER_MS)])
        gate = await gatePromise
      } else {
        gate = await runGate
      }

      const timelineText = gate.timeline
        .map((item) => `${item.phase}${item.detail ? `(${item.detail})` : ''}@${item.atMs}ms`)
        .join(' -> ')
      console.log('[Startup] gate finished:', gate.reason, `${gate.elapsedMs}ms`)
      console.log('[Startup] timeline:', timelineText)
      ;(window as Window & {
        __METAMATES_STARTUP_METRICS__?: typeof gate
        __METAMATES_STARTUP_BACKEND__?: string
      }).__METAMATES_STARTUP_METRICS__ = gate
      ;(window as Window & {
        __METAMATES_STARTUP_METRICS__?: typeof gate
        __METAMATES_STARTUP_BACKEND__?: string
      }).__METAMATES_STARTUP_BACKEND__ = settings.lastAgentBackend || gate.backend

      if (restoredWorkspacePath && wasStartupIndexAttached(restoredWorkspacePath)) {
        setFiles(workspaceIndexService.getAllFiles())
      }

      if (!cancelled) {
        applyThemeBootstrapToDocument()
        await waitUntilSplashEnter()
        if (!cancelled) setLoading(false)
      }

      const e2eNoAgents = (window as Window & { __METAMATES_E2E__?: { noAgents?: boolean } }).__METAMATES_E2E__?.noAgents
      if (!cancelled && !e2eNoAgents && window.electronAPI) {
        const latest = await storageService.getSettings().catch(() => settings)
        const hasAgent = await detectHasUsableAgent(latest.cliAgentEnabled)
        if (hasAgent && latest.engineSetupStatus !== 'ready') {
          const readyPatch = engineSetupReadyPatch(latest.preferredAssistant || latest.lastAgentBackend || '')
          await storageService.saveSettings(readyPatch)
          dispatch({ type: 'UPDATE_SETTINGS', payload: readyPatch })
        } else if (
          shouldShowEngineSetup({
            workspacePath: latest.workspacePath || restoredWorkspacePath,
            engineSetupStatus: latest.engineSetupStatus,
            hasUsableAgent: hasAgent,
          })
        ) {
          setShowEngineSetup(true)
        }
      }
    }
    
    void initApp()
    return () => {
      cancelled = true
    }
    // Mount-only: i18n/dispatch in deps previously cancelled splash exit on changeLanguage().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If a valid workspace is already active, never keep workspace picker open.
  useEffect(() => {
    if (!state.workspacePath || !window.electronAPI) return
    let cancelled = false
    void window.electronAPI.fileExists(state.workspacePath).then((result) => {
      if (cancelled) return
      if (shouldCloseWorkspacePicker(state.workspacePath, result.exists)) {
        setShowWorkspaceSelector(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [state.workspacePath])

  useEffect(() => {
    if (!state.workspacePath || !window.electronAPI) {
      if (window.electronAPI) {
        void window.electronAPI.syncWorkspacePath('').catch(() => {})
      }
      workspaceIndexService.detach()
      setFiles([])
      lastWorkspacePathRef.current = ''
      return
    }

    const isSwitch = Boolean(lastWorkspacePathRef.current && lastWorkspacePathRef.current !== state.workspacePath)
    lastWorkspacePathRef.current = state.workspacePath

    let cancelled = false

    const syncFiles = () => {
      setFiles(workspaceIndexService.getAllFiles())
    }
    syncFiles()

    void (async () => {
      if (!isSwitch && wasStartupIndexAttached(state.workspacePath)) {
        return
      }
      try {
        await window.electronAPI!.syncWorkspacePath(state.workspacePath)
        await workspaceIndexService.attachWorkspace(state.workspacePath)
        if (!cancelled) syncFiles()
      } catch (err) {
        console.warn('[App] workspace attach failed:', err)
      }
    })()

    const unsubscribe = workspaceIndexService.subscribe(() => {
      syncFiles()
    })

    if (isSwitch || !wasStartupIndexAttached(state.workspacePath)) {
      void (async () => {
        const settings = await storageService.getSettings()
        if (!settings.vaultApiEnabled) return
        const result = await window.electronAPI!.vaultApi.start(
          state.workspacePath,
          settings.vaultApiPort || 17333,
          settings.calendarIcsPath,
          !!settings.vaultApiLanAccess,
        )
        if (result && !result.success) {
          console.warn('[VaultAPI] Auto-start failed:', result.error)
        }
      })()
    }

    return () => {
      cancelled = true
      unsubscribe()
      workspaceIndexService.detach()
    }
  }, [state.workspacePath])

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
    const dateStr = getTodayDateString(resolveUserTimezone(state.settings.userTimezone))
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
  }, [state.workspacePath, state.settings.userTimezone, dispatch, i18n.language, t])

  const handleCreateDailyPlan = useCallback(async () => {
    if (!window.electronAPI || !state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }

    const language = getWorkspaceLanguage(i18n.language)
    const dateStr = getTodayDateString(resolveUserTimezone(state.settings.userTimezone))
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
  }, [state.workspacePath, state.settings.userTimezone, dispatch, i18n.language, t])

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
        const pluginPrompt = detectPluginInstallRequired(result)
        if (pluginPrompt.required) {
          openPluginInstallToast(t, pluginPrompt.pluginId)
          return
        }
        message.error(result.error || t('appShell.importIntelligenceFailed'))
        return
      }
      dispatch({
        type: 'ADD_TAB',
        payload: { path: result.notePath, name: result.noteName || 'intel.md', isDirty: false },
      })
      setRefreshKey((prev) => prev + 1)
      message.success(t('appShell.importIntelligenceSuccess', { name: result.noteName }))
      if (result.inboxArchivedCount && result.inboxArchivedCount > 0) {
        message.success(t('appShell.inboxArchivedAfterIntel', { count: result.inboxArchivedCount }))
      }
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

      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('metamates:save-file'))
        return
      }

      if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        if (state.currentFile) {
          void (async () => {
            const ok = await maybeCloseTab(state.openTabs, state.currentFile!, tEditor, t, {
              autoSave: state.settings.autoSave !== false,
            })
            if (ok) dispatch({ type: 'CLOSE_TAB', payload: state.currentFile! })
          })()
        }
        return
      }

      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const tabs = state.openTabs
        if (tabs.length < 2) return
        const currentIdx = tabs.findIndex((tab) => treePathsEqual(tab.path, state.currentFile ?? ''))
        const nextIdx = e.shiftKey
          ? (currentIdx <= 0 ? tabs.length - 1 : currentIdx - 1)
          : (currentIdx < 0 || currentIdx >= tabs.length - 1 ? 0 : currentIdx + 1)
        dispatch({ type: 'SET_ACTIVE_TAB', payload: tabs[nextIdx]!.path })
        return
      }

      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        toggleTheme()
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
  }, [dispatch, handleCreateDailyNote, handleCreateDailyPlan, state.currentFile, state.openTabs, t, tEditor, toggleTheme])

  useEffect(() => {
    const openPicker = () => setShowWorkspaceSelector(true)
    window.addEventListener('metamates:open-workspace-picker', openPicker)
    return () => window.removeEventListener('metamates:open-workspace-picker', openPicker)
  }, [])

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
      workspaceIndexService.signalVaultItemCreated(inboxPath, filePath)
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
    setGraphLaunchContext(null)
    setGraphVisible(true)
  }, [])

  const handleOpenInGraph = useCallback((paths: string[], dateLabel: string) => {
    setGraphLaunchContext({
      highlightPaths: paths,
      activityDateLabel: dateLabel,
      initialViewMode: 'activity',
    })
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
      if (isShippedTemplateWorkspace(path)) {
        message.error(t('appShell.templateWorkspaceForbidden'))
        return
      }
      const ok = await confirmAllDirtyTabsClosed(state.openTabs, tEditor, t, {
        autoSave: state.settings.autoSave !== false,
        currentFile: state.currentFile,
      })
      if (!ok) return
      const lang = i18n.language?.startsWith('en') ? 'en' : 'zh'
      await window.electronAPI.initWorkspace(path, lang)
      dispatch({ type: 'SET_WORKSPACE', payload: path })
      await storageService.saveSettings({ workspacePath: path })
      setShowWorkspaceSelector(false)
    }
  }

  const handleWorkspaceFromWizard = useCallback(async (path: string) => {
    if (isShippedTemplateWorkspace(path)) {
      message.error(t('appShell.templateWorkspaceForbidden'))
      return
    }
    const ok = await confirmAllDirtyTabsClosed(state.openTabs, tEditor, t, {
      autoSave: state.settings.autoSave !== false,
      currentFile: state.currentFile,
    })
    if (!ok) return
    dispatch({ type: 'SET_WORKSPACE', payload: path })
    await storageService.saveSettings({
      workspacePath: path,
      theme: 'dark',
      fontSize: 14,
      autoSave: true,
      language: i18n.language?.startsWith('en') ? 'en' : 'zh',
      ...engineSetupPendingPatch(),
    })
    setShowWorkspaceSelector(false)
  }, [dispatch, state.openTabs, t, tEditor, i18n.language])

  const createNewNote = () => {
    if (!state.workspacePath) {
      message.warning(t('appShell.openWorkspaceFirst'))
      return
    }
    setNewFileName('')
    setNewFileModalVisible(true)
  }

  const handleCreateNoteAtRoot = async () => {
    if (!window.electronAPI || !state.workspacePath || !newFileName.trim()) return

    const stem = newFileName.trim().replace(/\.md$/i, '')
    const fileName = `${stem}.md`
    const filePath = await window.electronAPI.path.join(state.workspacePath, fileName)

    const existsResult = await window.electronAPI.fileExists(filePath)
    if (existsResult.exists) {
      openFileInTab(filePath, fileName)
      message.info(t('appShell.fileOpened', { name: fileName }))
      setNewFileModalVisible(false)
      setNewFileName('')
      return
    }

    const heading = stem.replace(/_/g, ' ')
    const result = await window.electronAPI.writeFile(filePath, `# ${heading}\n\n`)
    if (result.success) {
      setNewFileModalVisible(false)
      setNewFileName('')
      openFileInTab(filePath, fileName)
      workspaceIndexService.signalVaultItemCreated(state.workspacePath, filePath)
      message.success(t('appShell.fileCreated', { name: fileName }))
    } else {
      message.error(t('appShell.fileCreateFailed', { error: result.error }))
    }
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
      message.success(t('appShell.folderCreated', { name: newFolderName }))
      setNewFolderModalVisible(false)
      setNewFolderName('')
      workspaceIndexService.signalVaultItemCreated(state.workspacePath, folderPath)
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
    setShowEngineSetup(true)
    dispatch({ type: 'UPDATE_SETTINGS', payload: { engineSetupStatus: 'pending' } })
  }, [dispatch])

  const handleEngineSetupComplete = useCallback((result: 'ready' | 'vault_only') => {
    setShowEngineSetup(false)
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { engineSetupStatus: result },
    })
    if (result === 'ready') {
      void handleCreateDailyNote()
    }
  }, [dispatch, handleCreateDailyNote])

  useEffect(() => {
    const openEngineSetup = () => {
      sessionStorage.removeItem(vaultReminderSessionKey())
      setShowEngineSetup(true)
    }
    window.addEventListener('metamates:open-engine-setup', openEngineSetup)
    return () => window.removeEventListener('metamates:open-engine-setup', openEngineSetup)
  }, [])

  if (loading) {
    return <StartupSplash />
  }

  if (!window.electronAPI) {
    const inElectronShell = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
    if (inElectronShell) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: '#18181b', padding: 24 }}>
          <Result
            status="error"
            title={t('desktop:preloadFailedTitle', { defaultValue: '桌面版加载异常' })}
            subTitle={t('desktop:preloadFailedSubtitle', { defaultValue: 'MetaMates 窗口已打开，但内部组件未就绪。请完全退出 MetaMates 后重新启动。' })}
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
          colorPrimary: appTheme.colors.primary,
          colorBgContainer: appTheme.colors.surface,
          colorBgElevated: appTheme.colors.elevated,
          colorText: isDark ? '#fafafa' : '#09090b',
          colorTextSecondary: appTheme.colors.textSecondary,
          colorBorder: appTheme.colors.border,
        },
      }}
    >
      <div className="app-container">
        <TitleBar />
        <div className="main-content">
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
          <div className="workspace-main-row">
            {!fileTreeCollapsed && (
              <div className="file-tree-column">
                <ErrorBoundary>
                  <FileTreePanel
                    collapsed={fileTreeCollapsed}
                    refreshKey={refreshKey}
                    onOpenInGraph={handleOpenInGraph}
                    onOpenWorkspace={selectWorkspace}
                  />
                </ErrorBoundary>
              </div>
            )}
            <Group orientation="horizontal" className="main-panel-group">
              <Panel defaultSize={60} minSize={20}>
                <ErrorBoundary>
                <div className="editor-area">
                  <TabBar />
                  {state.currentFile?.toLowerCase().endsWith('.pdf') ? (
                    <PdfViewer filePath={state.currentFile} />
                  ) : (
                    <Editor filePath={state.currentFile ?? undefined} />
                  )}
                </div>
                </ErrorBoundary>
              </Panel>
              <Separator className="panel-resize-separator" style={{ width: '8px' }} />
              <Panel defaultSize={40} minSize={20}>
                <div className="agent-panel-column">
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
        <WelcomeWizard
          visible={showWizard}
          workspacePath={state.workspacePath}
          onComplete={handleWizardComplete}
          onWorkspaceSelected={handleWorkspaceFromWizard}
        />
        <EngineSetupFlow
          visible={showEngineSetup}
          workspacePath={state.workspacePath}
          onComplete={handleEngineSetupComplete}
        />
        <div className="app-lazy-modals-host">
        <Suspense fallback={null}>
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
            onSwitchWorkspace={selectWorkspace}
          />
          <GlobalSearch 
            visible={globalSearchVisible}
            onClose={() => setGlobalSearchVisible(false)}
          />
          <GraphView
            visible={graphVisible}
            onClose={() => {
              setGraphVisible(false)
              setGraphLaunchContext(null)
            }}
            workspacePath={state.workspacePath || ''}
            focusFilePath={state.currentFile}
            highlightPaths={graphLaunchContext?.highlightPaths}
            activityDateLabel={graphLaunchContext?.activityDateLabel}
            initialViewMode={graphLaunchContext?.initialViewMode}
            onFileSelect={(path) => {
              const name = path.split(/[/\\]/).pop() || path
              dispatch({ type: 'ADD_TAB', payload: { path, name, isDirty: false } })
            }}
          />
          <TemplateSelector
            visible={templateVisible}
            onClose={() => setTemplateVisible(false)}
            onSelect={async (content: string, template: Template, fixedFileName?: string) => {
              if (!window.electronAPI || !state.workspacePath) return
              
              const now = new Date()
              const dateStr = getTodayDateString(resolveUserTimezone(state.settings.userTimezone))
              
              let filePath: string
              let fileName: string
              
              if (fixedFileName) {
                const nameWithoutExt = fixedFileName.replace('.md', '')
                fileName = `${dateStr} ${nameWithoutExt}.md`
                filePath = await window.electronAPI.path.join(state.workspacePath, fileName)
                
                const existsResult = await window.electronAPI.fileExists(filePath)
                if (existsResult.exists) {
                  dispatch({
                    type: 'ADD_TAB',
                    payload: { path: filePath, name: fileName, isDirty: false },
                  })
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
                workspaceIndexService.signalVaultItemCreated(state.workspacePath, filePath)
                dispatch({
                  type: 'ADD_TAB',
                  payload: { path: filePath, name: fileName, isDirty: false },
                })
                message.success(t('appShell.fileCreated', { name: fileName }))
              } else {
                message.error(t('appShell.fileCreateFailed', { error: result.error }))
              }
              
              setTemplateVisible(false)
            }}
          />
        </Suspense>
        </div>
        <Modal
          title={t('sidebar:newNote', { ns: 'sidebar' })}
          open={newFileModalVisible}
          onCancel={() => {
            setNewFileModalVisible(false)
            setNewFileName('')
          }}
          onOk={() => void handleCreateNoteAtRoot()}
          okText={t('actions.create')}
          cancelText={t('actions.cancel')}
        >
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder={t('sidebar:fileNamePlaceholder')}
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onPressEnter={() => void handleCreateNoteAtRoot()}
              autoFocus
            />
          </div>
        </Modal>
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
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              {t('appShell.selectWorkspaceDesc')}
            </p>
            <Button type="primary" size="large" onClick={selectWorkspace}>
              {t('appShell.selectWorkspaceButton')}
            </Button>
            <div style={{ textAlign: 'left', marginTop: 24, padding: '16px 20px', borderRadius: 8, background: 'var(--canvas-elevated)' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 13 }}>{t('appShell.selectWorkspaceTipsTitle')}</p>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.8 }}>
                <li>{t('appShell.selectWorkspaceTip1')}</li>
                <li>{t('appShell.selectWorkspaceTip2')}</li>
                <li>{t('appShell.selectWorkspaceTip3')}</li>
              </ul>
            </div>
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
        <div className="app-shell">
          <AppContent />
        </div>
      </AppProvider>
    </ThemeProvider>
  )
}

export default App
