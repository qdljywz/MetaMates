import React, { useRef, useEffect, useState, useCallback, useMemo, startTransition } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { useTheme } from '../hooks/useTheme'
import { useAppContext } from '../store/AppContext'
import type { RunSlashDetail } from '../utils/agentBridge'
import { storageService } from '../services/storage'

import type { DetectedAgent } from '../types/electron'
import { getAgentSlashCommands, type AgentSlashCommand } from '../commands/agentSlashCommands'
import { assembleSlashPrompt } from '../commands/assembleSlashPrompt'
import { verifySlashWriteback, resolveSlashWriteTargetPaths, writebackDetailI18nKey } from '../commands/slashWritebackVerify'
import { SLASH_WRITE_POLICIES } from '../commands/slashWritePolicy'
import {
  formatNowInTimezone,
  getEffectiveTimezone,
  getTodayDateString,
  getWorkspaceLanguage,
  isPathInsideWorkspace,
  resolveWorkspaceFilePath,
} from '../constants/paths'
import { workspaceIndexService } from '../services/workspaceIndex'
import {
  captureIntelligenceFromInput,
  buildIntelligenceEnhancePrompt,
} from '../services/intelligenceImport'
import { shouldCaptureAsIntelligence } from '../utils/intelligenceCapture'
import { composeChatBubble, normalizeHistoryBubble, extractToolCallFilePath, extractLineNumberFromToolText, inferToolCallKind, sanitizeAgentDisplayText } from '../services/agent-bridge/composeChatBubble'
import { applyStreamMessage } from '../services/message/acpStreamReducer'
import { useAcpStreamState } from '../hooks/useAcpStreamState'
import type { IResponseMessage } from '../../electron/shared/responseMessage'
import AgentChatInput, { buildAttachmentContext, type ChatAttachment } from './agent/AgentChatInput'
import AgentToolbar from './agent/AgentToolbar'
import AgentInputControls from './agent/AgentInputControls'
import AgentModePill from './agent/AgentModePill'
import AgentThinkingPlaceholder from './agent/AgentThinkingPlaceholder'
import AgentSlashBar from './agent/AgentSlashBar'
import AgentVaultContext from './agent/AgentVaultContext'
import AgentConnectingSkeleton from './agent/AgentConnectingSkeleton'
import AgentCliInstallGuide from './agent/AgentCliInstallGuide'
import CliInstallPanel from './CliInstallPanel'
import VirtualAgentMessageList, { type VirtualMessageListHandle } from './agent/VirtualAgentMessageList'
import type { AgentMessage } from './agent/AgentMessageItem'
import './agent/AgentPanel.css'
import { mapBackendSnapshotToStatus, DEFAULT_AGENT_MODE, isAutoApproveMode, type AgentConnStatus, type BackendConnectionSnapshot } from '../utils/agentConnectionStatus'
import { acknowledgeYoloMode, hasYoloAcknowledged, shouldSkipYoloFirstRunPrompt } from '../utils/yoloAcknowledgment'
import { mergeHistoryWithStreaming } from '../utils/messageMerge'
import { finalizeInProgressToolCalls, isToolCallInProgress, sanitizeStaleSessionMessages } from '../utils/toolCallStatus'
import { resolveAcpFailure } from '../utils/acpFailureResolution'
import { getModeOptionsForBackend } from '../utils/agentModes'
import { isPlanExpiredError, resolveAgentDisplayName, formatAcpErrorForDisplay } from '../utils/acpErrorMessages'
import { isGeminiModelDailyQuotaError, isNetworkErrorMessage } from '../../electron/acp/acpErrors'
import { pickAllowPermissionOption } from '../../electron/shared/acpPermission'
import { buildAgentToolbarCachePatch, readCachedAgentToolbarSync } from '../utils/agentToolbarCache'
import { consumeStartupHistoryCache, hasStartupHistoryCache } from '../utils/startupPreload'
import { archiveGraduatedInboxNotes } from '../services/graduateInboxArchive'
import { openSlashWritebackInEditor } from '../utils/openSlashWriteback'

function getBootAgentSnapshot() {
  return readCachedAgentToolbarSync()
}

function isE2ENoAgentsMode(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window as Window & { __METAMATES_E2E__?: { noAgents?: boolean } }).__METAMATES_E2E__?.noAgents
  )
}

async function fetchAgentsWithRetry(maxAttempts = 30): Promise<AgentInfo[]> {
  const e2eNoAgents = (window as Window & { __METAMATES_E2E__?: { noAgents?: boolean } }).__METAMATES_E2E__
    ?.noAgents
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const agents = await window.electronAPI?.acp?.detectAgents?.()
      if (Array.isArray(agents)) {
        if (agents.length > 0 || e2eNoAgents) return agents as AgentInfo[]
      }
    } catch {
      // IPC may not be ready yet on cold start
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  return []
}

interface AgentInfo {
  backend: string
  name: string
  cliPath?: string
  acpArgs?: string[]
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

type Message = AgentMessage

function isVisibleChatMessage(msg: Message): boolean {
  return msg.type !== 'thinking'
}

/** Recent tail only on switch — AionUi-style; load earlier on demand. */
const INITIAL_HISTORY_LIMIT = 50


function isGoogleOAuthMethod(methodId: string): boolean {
  const id = methodId.toLowerCase()
  if (id === 'gemini-api-key') return false
  return id.includes('google') || id.includes('oauth') || id === 'default' || id.includes('login')
}

function resolveAuthMethodLabel(
  method: { id: string; name?: string },
  t: (key: string) => string
): string {
  const name = method.name?.trim()
  if (name && name !== '...' && name.length > 1) return name
  if (method.id === 'gemini-api-key') return t('auth.apiKeyMethod')
  if (isGoogleOAuthMethod(method.id)) return t('auth.googleLogin')
  return method.id
}

const getTheme = (isDark: boolean) => ({
  bg: isDark ? '#1c1c1f' : '#ffffff',
  bgSecondary: isDark ? '#1c1c1f' : '#ffffff',
  bgTertiary: isDark ? '#202024' : '#fafaf9',
  surface: isDark ? '#202024' : '#f4f4f5',
  border: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)',
  text: isDark ? '#fafafa' : '#09090b',
  textSecondary: isDark ? '#d4d4d8' : '#3f3f46',
  primary: isDark ? '#ff8c28' : '#ff7a00',
  primaryText: isDark ? '#fff' : '#ffffff',
  primaryHover: isDark ? '#ffa050' : '#e66a00',
  success: isDark ? '#22c55e' : '#16a34a',
  warning: isDark ? '#eab308' : '#ca8a04',
  error: isDark ? '#ef4444' : '#dc2626',
  info: isDark ? '#00d4c4' : '#00b4a6',
})

const RECONNECT_DELAYS_MS = [5000, 15000, 30000]

type WarmupPhase = 'idle' | 'preparing' | 'ready' | 'error'

const AgentChatPanel: React.FC = () => {
  const { t: tCmd, i18n } = useTranslation('commands')
  const { t } = useTranslation('agent')
  const staticSlashCommands = useMemo(() => getAgentSlashCommands(i18n.language), [i18n.language])
  const { state, dispatch } = useAppContext()
  const messageListRef = useRef<VirtualMessageListHandle>(null)
  const workspacePathRef = useRef<string>('')
  
  const bootSnapshot = useMemo(() => (isE2ENoAgentsMode() ? { agents: [], lastBackend: null } : getBootAgentSnapshot()), [])

  const [currentBackend, setCurrentBackend] = useState<string | null>(() =>
    isE2ENoAgentsMode() ? null : bootSnapshot.lastBackend,
  )
  const [detectedAgents, setDetectedAgents] = useState<AgentInfo[]>(() =>
    isE2ENoAgentsMode() ? [] : bootSnapshot.agents,
  )
  const [agentsScanReady, setAgentsScanReady] = useState(() => isE2ENoAgentsMode())
  const [cliInstallOpen, setCliInstallOpen] = useState(false)
  const [rescanningAgents, setRescanningAgents] = useState(false)
  const [chatDbUnavailable, setChatDbUnavailable] = useState(false)
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map())
  const [status, setStatus] = useState<AgentConnStatus>('disconnected')
  const [agentStatus, setAgentStatus] = useState<Map<string, AgentConnStatus>>(() =>
    isE2ENoAgentsMode()
      ? new Map()
      : new Map(bootSnapshot.agents.map((a) => [a.backend, 'disconnected'])),
  )
  const [statusText, setStatusText] = useState('')
  const [userScrolled, setUserScrolled] = useState(false)
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [selectedMode, setSelectedMode] = useState<string>(DEFAULT_AGENT_MODE)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentCommand, setCurrentCommand] = useState<AgentSlashCommand | null>(null)
  const [pendingPermission, setPendingPermission] = useState<{
    backend: string
    requestId: number
    toolCall?: { title?: string }
    options: Array<{ optionId: string; name?: string; kind?: string }>
  } | null>(null)
  const [pendingYoloMode, setPendingYoloMode] = useState<string | null>(null)
  const [yoloFirstRunPrompt, setYoloFirstRunPrompt] = useState(false)
  const [pendingAuth, setPendingAuth] = useState<{
    backend: string
    methods: Array<{ id: string; name?: string }>
    error?: string
  } | null>(null)
  const [authInProgress, setAuthInProgress] = useState(false)
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [warmupPhase, setWarmupPhase] = useState<WarmupPhase>('idle')
  const [historyHasMore, setHistoryHasMore] = useState<Map<string, boolean>>(new Map())
  const [historyTotals, setHistoryTotals] = useState<Map<string, number>>(new Map())
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [messagesPaneEpoch, setMessagesPaneEpoch] = useState(0)
  const historyFetchRef = useRef<Set<string>>(new Set())
  const agentStatusRef = useRef(agentStatus)
  agentStatusRef.current = agentStatus
  const [acpDynamicCommands, setAcpDynamicCommands] = useState<Array<{ name: string; description?: string }>>([])
  const [failureHint, setFailureHint] = useState<{ action: string; backend: string } | null>(null)
  
  const slashCommands = useMemo(() => {
    const staticIds = new Set(staticSlashCommands.map((c) => c.id))
    const dynamic = acpDynamicCommands
      .map((cmd) => {
        const id = cmd.name.startsWith('/') ? cmd.name : `/${cmd.name}`
        return {
          id,
          name: id,
          category: 'daily' as const,
          prompt: cmd.description || cmd.name,
          inputMode: 'optional' as const,
        }
      })
      .filter((cmd) => !staticIds.has(cmd.id))
    return [...staticSlashCommands, ...dynamic]
  }, [staticSlashCommands, acpDynamicCommands])
  const currentMsgIdRef = useRef<string | null>(null)
  const currentBackendRef = useRef<string | null>(bootSnapshot.lastBackend)
  const connectInBackgroundRef = useRef<(backend: string, options?: { freshSession?: boolean }) => Promise<void>>(async () => {})
  const warmupPromiseRef = useRef<Map<string, Promise<void>>>(new Map())
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAgentRefreshRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const messagesRef = useRef<Map<string, Message[]>>(new Map())
  const pendingSlashVerifyRef = useRef<{ cmdId: string; turnStartedAt: number } | null>(null)
  const runSlashWritebackVerifyRef = useRef<(backend?: string) => Promise<void>>(async () => {})

  const { theme: appTheme } = useTheme()
  const isDark = appTheme.mode === 'dark'
  const theme = useMemo(() => getTheme(isDark), [isDark])

  const syncAcpConnection = useCallback(
    (
      backend: string,
      connStatus: AgentConnStatus,
      extra?: { sessionId?: string; mode?: string; error?: string }
    ) => {
      dispatch({
        type: 'SET_ACP_CONNECTION',
        payload: {
          connectionId: backend,
          backend: { id: backend, name: backend },
          status: connStatus,
          sessionId: extra?.sessionId,
          mode: extra?.mode,
          error: extra?.error,
        },
      })
    },
    [dispatch]
  )

  /** Apply a pushed or polled connection snapshot to toolbar state. */
  const applyConnectionSnapshot = useCallback((backend: string, snapshot: BackendConnectionSnapshot) => {
    const mapped = mapBackendSnapshotToStatus(snapshot)
    setAgentStatus((prev) => {
      const next = new Map(prev)
      next.set(backend, mapped)
      return next
    })
    if (backend !== currentBackendRef.current) return
    setStatus(mapped)
    const agentName = detectedAgents.find((a) => a.backend === backend)?.name || backend
    if (mapped === 'connected') {
      setStatusText(t('status.connected', { name: agentName }))
    } else if (mapped === 'connecting') {
      setStatusText(t('status.connecting', { name: agentName }))
    } else if (mapped === 'auth_required') {
      setStatusText(t('status.authRequired'))
    } else if (mapped === 'error') {
      setStatusText(t('status.error', { error: snapshot.error || t('status.disconnected') }))
    } else {
      setStatusText(t('status.disconnected'))
    }
    if (mapped !== 'auth_required') {
      setPendingAuth((prev) => (prev?.backend === backend ? null : prev))
    }
  }, [detectedAgents, t])

  /** Sync toolbar dots from main-process connection pool (source of truth). */
  const syncAllAgentStatuses = useCallback(async (backends?: string[]) => {
    const api = window.electronAPI?.acp
    if (!api?.getAllConnectionStatuses) return
    try {
      const snapshots = await api.getAllConnectionStatuses()
      const keys = backends ?? Object.keys(snapshots)
      for (const backend of keys) {
        const snapshot = snapshots[backend]
        if (snapshot) {
          applyConnectionSnapshot(backend, snapshot)
        } else {
          setAgentStatus((prev) => {
            const next = new Map(prev)
            next.set(backend, 'disconnected')
            return next
          })
        }
      }
    } catch {
      // best-effort
    }
  }, [applyConnectionSnapshot])

  const log = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    console.log(`[${type.toUpperCase()}] ${msg}`)
  }, [])

  const suggestAlternateAgents = useCallback((failedBackend: string): AgentInfo[] => {
    return detectedAgents.filter((agent) => {
      if (agent.backend === failedBackend) return false
      const st = agentStatus.get(agent.backend)
      return st !== 'auth_required' && st !== 'error'
    })
  }, [detectedAgents, agentStatus])

  const formatAlternateAgentHint = useCallback((failedBackend: string): string | null => {
    const alternates = suggestAlternateAgents(failedBackend)
    if (alternates.length === 0) return null
    const names = alternates.slice(0, 3).map((a) => a.name).join('、')
    return t('status.tryAlternateAgents', { names })
  }, [suggestAlternateAgents, t])

  const markSlashWritebackPending = useCallback((cmdId: string) => {
    const policy = SLASH_WRITE_POLICIES[cmdId]
    if (policy?.write === 'required' && policy.verify) {
      pendingSlashVerifyRef.current = { cmdId, turnStartedAt: Date.now() }
    }
  }, [])

  const finalizeStreamingTurn = useCallback((backend?: string) => {
    const target = backend || currentBackendRef.current || ''
    if (!target) return

    const isActiveBackend = target === currentBackendRef.current
    if (isActiveBackend) {
      currentMsgIdRef.current = null
      dispatch({ type: 'SET_ACP_STREAMING', payload: false })
    }

    setMessages(prev => {
      const newMap = new Map(prev)
      const list = [...(newMap.get(target) || [])]
      let nextList = finalizeInProgressToolCalls(list)
      if (nextList.length > 0) {
        const last = nextList[nextList.length - 1]
        if (last.type === 'agent' && last.status === 'streaming') {
          nextList = [...nextList]
          nextList[nextList.length - 1] = { ...last, status: 'finish' }
        }
      }
      newMap.set(target, nextList)
      messagesRef.current = newMap
      return newMap
    })
  }, [dispatch])

  const { handleControlMessage, resetTurnState } = useAcpStreamState({
    setStreaming: (active) => dispatch({ type: 'SET_ACP_STREAMING', payload: active }),
  })

  const handleStopStreaming = useCallback(() => {
    window.electronAPI?.acp.cancelPrompt(currentBackendRef.current || undefined)
    finalizeStreamingTurn()
    log('Prompt cancelled', 'info')
  }, [finalizeStreamingTurn, log])


  const extractText = useCallback((content: any): string => {
    if (!content) return ''
    if (typeof content === 'string') return content
    if (content.type === 'text' && content.text) return content.text
    if (content.type === 'content' && content.content) {
      return extractText(content.content)
    }
    if (content.content) {
      if (typeof content.content === 'string') return content.content
      if (content.content.type === 'text' && content.content.text) return content.content.text
    }
    if (Array.isArray(content)) {
      return content.map(c => extractText(c)).join('')
    }
    return ''
  }, [])

  const renderMarkdown = useCallback((text: string): string => {
    if (!text) return ''
    if (typeof text !== 'string') {
      text = JSON.stringify(text)
    }
    try {
      const renderer = new marked.Renderer()
      renderer.code = function({ text: codeText, lang }: { text: string; lang?: string }) {
        if (typeof codeText !== 'string') {
          codeText = JSON.stringify(codeText)
        }
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre><code class="hljs language-${lang}">${hljs.highlight(codeText, { language: lang }).value}</code></pre>`
          } catch {}
        }
        return `<pre><code class="hljs">${hljs.highlightAuto(codeText).value}</code></pre>`
      }
      const result = marked.parse(text, { renderer, breaks: true, gfm: true }) as string
      return result
    } catch (err) {
      console.error('[RENDER] Parse error:', err)
      return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    }
  }, [])

  const addMessageToState = useCallback((backend: string, msg: any) => {
    setMessages(prev => {
      const newMap = new Map(prev)
      const list = [...(newMap.get(backend) || [])]
      let incoming: Message | null = null

      if (msg.type === 'text' || msg.type === 'agent_message') {
        const agentText = sanitizeAgentDisplayText(extractText(msg.content))
        if (!agentText) {
          return prev
        }
        incoming = {
          id: msg.id || Date.now().toString(),
          msg_id: currentMsgIdRef.current || undefined,
          type: 'agent',
          content: agentText,
          position: 'left',
          status: 'streaming',
        }
      } else if (msg.type === 'user_message') {
        incoming = {
          id: Date.now().toString(),
          type: 'user',
          content: extractText(msg.content),
          attachments: msg.attachments,
          position: 'right',
          status: 'finish',
        }
      } else if (msg.type === 'tool_call') {
        const rawInputValue = msg.rawInput
        const rawInputText = typeof rawInputValue === 'string'
          ? rawInputValue
          : (rawInputValue ? JSON.stringify(rawInputValue, null, 2) : undefined)
        const toolTitle = msg.title || 'Tool'
        const toolKind = msg.kind || inferToolCallKind(toolTitle)
        const toolContent = extractText(msg.content) || ''
        const structuredContent = msg.structuredContent ?? msg.content
        const persistedPath = typeof msg.toolFilePath === 'string' ? msg.toolFilePath : undefined
        incoming = {
          id: msg.toolCallId || Date.now().toString(),
          type: 'tool-call',
          toolCallId: msg.toolCallId,
          title: toolTitle,
          kind: toolKind,
          status: msg.status || 'in_progress',
          content: toolContent,
          rawInput: rawInputText,
          structuredContent,
          toolFilePath: persistedPath || extractToolCallFilePath({
            title: toolTitle,
            kind: toolKind,
            content: toolContent,
            rawInput: rawInputValue,
            locations: msg.locations,
            structuredContent,
            toolFilePath: undefined,
          }, { allowTextFallback: false }) || undefined,
          position: 'left',
        }
      } else if (msg.type === 'tips') {
        incoming = {
          id: Date.now().toString(),
          type: 'thinking',
          content: extractText(msg.content),
          status: 'streaming',
          position: 'center',
        }
      } else if (msg.type === 'plan') {
        incoming = {
          id: msg.id || Date.now().toString(),
          type: 'plan',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2),
          title: msg.title || 'Plan',
          position: 'left',
        }
      }

      const nextList = incoming ? composeChatBubble(list, incoming) as Message[] : list
      newMap.set(backend, nextList)
      messagesRef.current = newMap
      return newMap
    })
  }, [extractText])

  const runSlashWritebackVerify = useCallback(async (backend?: string) => {
    const pending = pendingSlashVerifyRef.current
    pendingSlashVerifyRef.current = null
    if (!pending || !state.workspacePath) return

    await new Promise((r) => setTimeout(r, 800))

    const language = getWorkspaceLanguage(i18n.language)
    let result = await verifySlashWriteback({
      cmdId: pending.cmdId,
      workspacePath: state.workspacePath,
      language,
      turnStartedAt: pending.turnStartedAt,
    })
    if (!result.ok && !result.skipped) {
      await new Promise((r) => setTimeout(r, 2000))
      result = await verifySlashWriteback({
        cmdId: pending.cmdId,
        workspacePath: state.workspacePath,
        language,
        turnStartedAt: pending.turnStartedAt,
      })
    }
    if (result.skipped) return

    const cmdName = pending.cmdId.replace(/^\//, '')
    const targetPaths = resolveSlashWriteTargetPaths(pending.cmdId, language).join(', ')
    const activeBackend = backend || currentBackendRef.current || ''

    if (result.ok) {
      addMessageToState(activeBackend, {
        type: 'text',
        content: t('writeback.verifiedDetail', { cmd: cmdName, paths: targetPaths }),
      })
      log(t('writeback.verifiedDetail', { cmd: cmdName, paths: targetPaths }), 'success')

      const openedPath = await openSlashWritebackInEditor({
        cmdId: pending.cmdId,
        workspacePath: state.workspacePath,
        language,
        dispatch,
      })
      const openedName = openedPath?.split(/[/\\]/).pop()
      if (openedName) {
        message.success(t('writeback.verifiedOpened', { cmd: cmdName, file: openedName }))
      } else {
        message.success(t('writeback.verified', { cmd: cmdName }))
      }

      if (pending.cmdId === '/graduate' && state.workspacePath) {
        const sourceTexts = (messagesRef.current.get(activeBackend) || [])
          .slice(-30)
          .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
          .filter((text) => text.trim().length > 0)
        const archiveResult = await archiveGraduatedInboxNotes({
          workspacePath: state.workspacePath,
          language,
          sourceTexts,
        })
        if (archiveResult.moved.length > 0) {
          window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
          message.success(t('writeback.inboxArchived', { count: archiveResult.moved.length }))
          log(t('writeback.inboxArchived', { count: archiveResult.moved.length }), 'success')
        }
      }
    } else {
      const rawDetails = result.targets.filter((row) => !row.ok).map((row) => row.detail)
      const detail = rawDetails
        .map((code) => {
          const key = writebackDetailI18nKey(code)
          if (key === 'writeback.failedDetail') return code
          return t(key, { cmd: cmdName, defaultValue: code })
        })
        .join('；') || t('writeback.detailNotUpdated')
      addMessageToState(activeBackend, {
        type: 'text',
        content: t('writeback.failedDetail', { cmd: cmdName, paths: targetPaths, detail }),
      })
      log(`${t('writeback.failed', { cmd: cmdName })} — ${detail}`, 'error')
    }
  }, [state.workspacePath, i18n.language, t, log, addMessageToState, dispatch])

  runSlashWritebackVerifyRef.current = runSlashWritebackVerify

  const scrollToBottom = useCallback((force = false) => {
    messageListRef.current?.scrollToBottom(force)
  }, [])

  const scrollToLatestMessages = useCallback((force = false) => {
    if (!force && userScrolled) return
    const tick = () => scrollToBottom(force)
    requestAnimationFrame(() => {
      requestAnimationFrame(tick)
    })
    window.setTimeout(tick, 80)
    window.setTimeout(tick, 200)
    window.setTimeout(tick, 400)
  }, [userScrolled, scrollToBottom])

  const appendUserBubble = useCallback((backend: string, content: string, attachments?: ChatAttachment[]) => {
    const trimmed = content.trim()
    if (!trimmed && (!attachments || attachments.length === 0)) return

    addMessageToState(backend, {
      type: 'user_message',
      content: trimmed,
      attachments,
    })
    requestAnimationFrame(() => scrollToBottom(true))
  }, [addMessageToState, scrollToBottom])

  const loadSlashPrompt = useCallback(async (cmd: AgentSlashCommand, userInput: string): Promise<string> => {
    const language = getWorkspaceLanguage(i18n.language)
    const skillName = cmd.id.replace(/^\//, '')
    const skillResult = await window.electronAPI?.acp.readSkillFile(skillName, currentBackendRef.current || undefined)
    if (skillResult?.success && skillResult.content) {
      log(`Loaded skill file: ${skillName}`, 'success')
    } else {
      log(`Using default prompt for ${cmd.name}`, 'info')
    }
    return assembleSlashPrompt({
      cmd,
      language,
      workspacePath: state.workspacePath || undefined,
      skillContent: skillResult?.success ? skillResult.content : null,
      userInput,
      timezone: getEffectiveTimezone(),
    })
  }, [i18n.language, log, state.workspacePath])

  const handlePromptFailure = useCallback((backend: string, err: { error?: string; message?: string; quotaExceeded?: boolean; authRequired?: boolean }) => {
    pendingSlashVerifyRef.current = null
    finalizeStreamingTurn(backend)
    const errorText = formatAcpErrorForDisplay(err?.error || err?.message || 'unknown')
    const resolution = resolveAcpFailure(err)
    const alternateHint = formatAlternateAgentHint(backend)
    const agentName = resolveAgentDisplayName(backend, detectedAgents)

    if (isGeminiModelDailyQuotaError(errorText) && backend === 'gemini') {
      addMessageToState(backend, {
        type: 'text',
        content: `${t('status.geminiModelDailyQuotaDetail', { agent: agentName, error: errorText })}${alternateHint ? `\n\n${alternateHint}` : ''}`,
      })
      if (alternateHint) setFailureHint({ action: 'switch_agent', backend })
    } else if (isNetworkErrorMessage(errorText)) {
      void window.electronAPI?.acp.invalidateCloudReachability?.(backend)
      void syncAllAgentStatuses([backend])
      addMessageToState(backend, {
        type: 'text',
        content: `${t('status.networkErrorDetail', { agent: agentName, error: errorText })}${alternateHint ? `\n\n${alternateHint}` : ''}`,
      })
      setFailureHint({ action: 'reconnect', backend })
    } else if (resolution.kind === 'quota') {
      const planExpired = isPlanExpiredError(errorText)
      addMessageToState(backend, {
        type: 'text',
        content: `${t(planExpired ? 'status.planExpiredDetail' : 'status.quotaExceededDetail', { agent: agentName, error: errorText })}${alternateHint ? `\n\n${alternateHint}` : ''}`,
      })
      if (alternateHint) setFailureHint({ action: 'switch_agent', backend })
    } else if (resolution.kind === 'auth_required') {
      void (async () => {
        const methods = (await window.electronAPI?.acp.getAuthMethods?.(backend)) || []
        markAuthRequired(backend, { authMethods: methods, error: errorText }, { showModal: true })
      })()
      addMessageToState(backend, {
        type: 'text',
        content: t('status.authRequired'),
      })
      if (alternateHint) {
        addMessageToState(backend, { type: 'text', content: alternateHint })
        setFailureHint({ action: 'switch_agent', backend })
      }
    } else if (resolution.kind === 'disconnected') {
      setFailureHint({ action: 'reconnect', backend })
      addMessageToState(backend, {
        type: 'text',
        content: t('status.reconnectHint'),
      })
    } else {
      addMessageToState(backend, {
        type: 'text',
        content: `${t('status.promptFailed', { error: errorText })}${alternateHint ? `\n\n${alternateHint}` : ''}`,
      })
    }
    log(`Error: ${errorText}`, 'error')
  }, [addMessageToState, finalizeStreamingTurn, log, t, formatAlternateAgentHint, detectedAgents, syncAllAgentStatuses])

  const autoOpenedPathsRef = useRef<Set<string>>(new Set())

  const openEditorAt = useCallback(async (
    filePath: string,
    line?: number,
    options?: { silent?: boolean }
  ) => {
    if (!state.workspacePath || !window.electronAPI) {
      if (!options?.silent) message.warning(t('toolCall.noWorkspace'))
      return
    }

    const language = getWorkspaceLanguage(i18n.language)
    const resolved = await resolveWorkspaceFilePath(
      state.workspacePath,
      filePath,
      language,
      workspaceIndexService.getAllFiles()
    )

    if (!resolved) {
      if (!options?.silent) {
        const outside = !isPathInsideWorkspace(state.workspacePath, filePath)
        message.warning(
          outside
            ? t('toolCall.outsideWorkspace', { path: filePath })
            : t('toolCall.fileNotFound', { path: filePath })
        )
      }
      return
    }

    const fileName = resolved.split(/[/\\]/).pop() || resolved
    dispatch({
      type: 'OPEN_EDITOR_AT',
      payload: { path: resolved, name: fileName, line },
    })
  }, [state.workspacePath, dispatch, t, i18n.language])

  const handleOpenToolFile = useCallback((filePath: string, line?: number) => {
    void openEditorAt(filePath, line)
  }, [openEditorAt])

  const maybeAutoOpenToolFile = useCallback((msg: Message) => {
    if (msg.type !== 'tool-call' || msg.status !== 'completed') return
    const kind = inferToolCallKind(msg.title, msg.kind)
    if (kind !== 'read' && kind !== 'edit') return
    const filePath = msg.toolFilePath?.trim() || extractToolCallFilePath({
      title: msg.title,
      kind: msg.kind,
      content: msg.content,
      rawInput: msg.rawInput,
      structuredContent: msg.structuredContent,
    }, { allowTextFallback: false })
    if (!filePath) return
    if (!state.workspacePath || !isPathInsideWorkspace(state.workspacePath, filePath)) return
    const haystack = `${msg.title || ''} ${msg.content || ''} ${msg.rawInput || ''}`
    const dedupeKey = `${msg.toolCallId || ''}:${filePath}`
    if (autoOpenedPathsRef.current.has(dedupeKey)) return
    autoOpenedPathsRef.current.add(dedupeKey)
    const line = extractLineNumberFromToolText(haystack) ?? undefined
    void openEditorAt(filePath, line, { silent: true })
  }, [openEditorAt, state.workspacePath])

  useEffect(() => {
    if (!userScrolled) {
      scrollToLatestMessages(true)
    }
  }, [messages, currentBackend, userScrolled, scrollToLatestMessages])

  const dismissAuthModal = useCallback(() => {
    setPendingAuth(null)
    setShowApiKeyInput(false)
    setApiKeyInput('')
    setPendingAuthUrl(null)
    setAuthInProgress(false)
    const active = currentBackendRef.current
    if (active) {
      void syncAllAgentStatuses([active])
    }
  }, [syncAllAgentStatuses])

  /** Drop stale auth UI when user switches to another agent. */
  useEffect(() => {
    setPendingAuth((prev) => (prev && prev.backend !== currentBackend ? null : prev))
    setShowApiKeyInput(false)
    setApiKeyInput('')
    setPendingAuthUrl(null)
    setAuthInProgress(false)
  }, [currentBackend])

  const markAuthRequired = useCallback((
    backend: string,
    sessionResult: { authMethods?: Array<{ id: string; name?: string }>; error?: string },
    options?: { showModal?: boolean },
  ) => {
    setAgentStatus(prev => {
      const newMap = new Map(prev)
      newMap.set(backend, 'auth_required')
      return newMap
    })
    const showModal = options?.showModal ?? false
    if (!showModal || backend !== currentBackendRef.current) {
      return
    }
    setPendingAuth({
      backend,
      methods: sessionResult.authMethods || [],
      error: sessionResult.error,
    })
    setStatus('auth_required')
    setStatusText(t('status.authRequired'))
    const alternateHint = formatAlternateAgentHint(backend)
    if (alternateHint) setFailureHint({ action: 'switch_agent', backend })
    log(`${backend} 需要认证`, 'error')
  }, [log, t, formatAlternateAgentHint])

  const persistAcpPreference = useCallback(async (backend: string, patch: { mode?: string; modelId?: string }) => {
    try {
      const settings = await storageService.getSettings()
      const existing = settings.acpPreferences?.[backend] || {}
      await storageService.saveSettings({
        acpPreferences: {
          ...(settings.acpPreferences || {}),
          [backend]: { ...existing, ...patch },
        },
      })
    } catch {
      // best-effort
    }
  }, [])

  /** Apply readiness after session exists — status first; models/commands load in background. */
  const hydrateBackendMetadata = useCallback(async (backend: string) => {
    if (backend !== currentBackendRef.current) return

    try {
      const settings = await storageService.getSettings()
      const pref = settings.acpPreferences?.[backend]

      if (pref?.mode) {
        try {
          await window.electronAPI?.acp.setMode(pref.mode)
          setSelectedMode(pref.mode)
        } catch {
          const modeResult = await window.electronAPI?.acp.getMode()
          setSelectedMode(modeResult?.mode || DEFAULT_AGENT_MODE)
        }
      } else {
        const modeResult = await window.electronAPI?.acp.getMode()
        setSelectedMode(modeResult?.mode || DEFAULT_AGENT_MODE)
      }

      const modelsResult = await window.electronAPI?.acp.getModels()
      if (modelsResult?.models) {
        setModels(modelsResult.models)
        if (modelsResult.models.length > 0) {
          const sessionInfo = await window.electronAPI?.acp.getSessionInfo?.(backend)
          const userModelId = pref?.modelId
          const sessionModelId = sessionInfo?.modelId
          const autoModel = backend === 'gemini'
            ? modelsResult.models.find((m) => /auto/i.test(m.id) || /auto/i.test(m.name))
            : undefined
          const pick = userModelId && modelsResult.models.some((m) => m.id === userModelId)
            ? userModelId
            : (backend === 'gemini' && autoModel?.id)
              ? autoModel.id
              : sessionModelId && modelsResult.models.some((m) => m.id === sessionModelId)
                ? sessionModelId
                : modelsResult.models[0].id
          try {
            await window.electronAPI?.acp.setModel(pick)
          } catch {
            // best-effort
          }
          setSelectedModel(pick)
          void persistAcpPreference(backend, { modelId: pick })
        }
      }

      const acpCommands = await window.electronAPI?.acp.getAvailableCommands?.(backend)
      if (acpCommands && acpCommands.length > 0) {
        setAcpDynamicCommands(acpCommands)
      }
    } catch {
      // metadata is best-effort — chat works without it
    }
  }, [persistAcpPreference])

  const finalizeBackendSession = useCallback(async (
    backend: string,
    sessionResult: { sessionId?: string; resumed?: boolean; mode?: string },
  ): Promise<boolean> => {
    const snapshot = await window.electronAPI?.acp.getConnectionStatus?.(backend)
    const mapped = mapBackendSnapshotToStatus(snapshot)

    if (mapped === 'auth_required') {
      const methods = (await window.electronAPI?.acp.getAuthMethods?.(backend)) || []
      markAuthRequired(backend, { authMethods: methods }, { showModal: false })
      return false
    }

    if (mapped !== 'connected') {
      return false
    }

    if (backend === currentBackendRef.current) {
      setStatus('connected')
      const agentName = detectedAgents.find((a) => a.backend === backend)?.name || backend
      setStatusText(t('status.connected', { name: agentName }))
      syncAcpConnection(backend, 'connected', {
        sessionId: sessionResult.sessionId,
        mode: sessionResult.mode || DEFAULT_AGENT_MODE,
      })
      setSessionId(sessionResult.sessionId ?? null)
      if (sessionResult.mode) {
        setSelectedMode(sessionResult.mode)
      }
      setWarmupPhase('ready')
      reconnectAttemptRef.current = 0
      setFailureHint(null)
      void hydrateBackendMetadata(backend)
    }

    void syncAllAgentStatuses([backend])
    return true
  }, [syncAllAgentStatuses, markAuthRequired, syncAcpConnection, detectedAgents, t, hydrateBackendMetadata])

  const convertHistoryMessage = useCallback((m: any): Message => {
    const normalized = normalizeHistoryBubble(m) as Message
    if (m?.created_at != null) {
      return { ...normalized, created_at: Number(m.created_at) }
    }
    return normalized
  }, [])

  const applyHistoryBatch = useCallback((
    backend: string,
    batch: Message[],
    hasMore: boolean,
    prepend = false,
  ) => {
    if (batch.length === 0) {
      setHistoryHasMore(prev => {
        const next = new Map(prev)
        next.set(backend, hasMore)
        return next
      })
      return
    }

    startTransition(() => {
      setMessages(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(backend) || []
        const converted = batch
          .map(convertHistoryMessage)
          .filter(isVisibleChatMessage)
        const sanitized = sanitizeStaleSessionMessages(converted)
        if (prepend) {
          newMap.set(backend, [...sanitized, ...existing])
        } else if (existing.length === 0) {
          newMap.set(backend, sanitized)
        } else {
          newMap.set(backend, mergeHistoryWithStreaming(sanitized, existing))
        }
        messagesRef.current = newMap
        return newMap
      })
      setHistoryHasMore(prev => {
        const next = new Map(prev)
        next.set(backend, hasMore)
        return next
      })
    })
  }, [convertHistoryMessage])

  const applyHistoryMeta = useCallback((backend: string, total?: number, hasMore?: boolean) => {
    if (typeof total === 'number') {
      setHistoryTotals(prev => {
        const next = new Map(prev)
        next.set(backend, total)
        return next
      })
    }
    if (typeof hasMore === 'boolean') {
      setHistoryHasMore(prev => {
        const next = new Map(prev)
        next.set(backend, hasMore)
        return next
      })
    }
  }, [])

  const loadAgentHistory = useCallback(async (
    backend: string,
    options?: { force?: boolean; limit?: number; silent?: boolean },
  ) => {
    const cached = messagesRef.current.get(backend)
    if (!options?.force && cached && cached.length > 0) {
      return
    }
    if (historyFetchRef.current.has(backend) && !options?.force) {
      return
    }
    historyFetchRef.current.add(backend)
    const showLoadingIndicator = !options?.silent
      && !hasStartupHistoryCache(backend)
      && backend === currentBackendRef.current
      && !(messagesRef.current.get(backend)?.length)
    if (showLoadingIndicator) setHistoryLoading(true)

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      if (backend !== currentBackendRef.current && !options?.force) return

      const result = await window.electronAPI?.acp.getConversationHistory(backend, {
        limit: options?.limit ?? INITIAL_HISTORY_LIMIT,
      })
      if (!result?.messages?.length) {
        applyHistoryMeta(backend, result?.total, result?.hasMore ?? false)
        applyHistoryBatch(backend, [], result?.hasMore ?? false)
        if (backend === currentBackendRef.current) {
          resetTurnState()
        }
        return
      }

      applyHistoryMeta(backend, result.total, result.hasMore)
      applyHistoryBatch(backend, result.messages as Message[], result.hasMore)

      if (backend === currentBackendRef.current) {
        resetTurnState()
        setUserScrolled(false)
        scrollToLatestMessages(true)
      }
    } finally {
      historyFetchRef.current.delete(backend)
      if (backend === currentBackendRef.current) {
        setHistoryLoading(false)
      }
    }
  }, [applyHistoryBatch, applyHistoryMeta, resetTurnState, scrollToLatestMessages])

  const loadEarlierMessages = useCallback(async () => {
    const backend = currentBackendRef.current
    if (!backend || loadingEarlier) return
    const list = messagesRef.current.get(backend) || []
    const first = list[0]
    const before = first?.created_at
    if (before == null) return

    setLoadingEarlier(true)
    try {
      const el = messageListRef.current?.getScrollElement()
      const prevScrollTop = el?.scrollTop ?? 0
      const prevHeight = el?.scrollHeight ?? 0

      const result = await window.electronAPI?.acp.getConversationHistory(backend, {
        limit: INITIAL_HISTORY_LIMIT,
        before,
      })
      if (!result?.messages?.length) {
        applyHistoryMeta(backend, result?.total, false)
        return
      }

      applyHistoryMeta(backend, result?.total, result.hasMore)
      applyHistoryBatch(backend, result.messages as Message[], result.hasMore, true)

      requestAnimationFrame(() => {
        const scrollEl = messageListRef.current?.getScrollElement()
        if (scrollEl) {
          scrollEl.scrollTop = prevScrollTop + (scrollEl.scrollHeight - prevHeight)
        }
      })
    } finally {
      setLoadingEarlier(false)
    }
  }, [applyHistoryBatch, applyHistoryMeta, loadingEarlier])

  const handleBackendReady = useCallback(async (
    backend: string,
    result: {
      success: boolean
      sessionId?: string
      mode?: string
      error?: string
      quotaExceeded?: boolean
      authRequired?: boolean
      authMethods?: Array<{ id: string; name?: string }>
    },
  ) => {
    void syncAllAgentStatuses([backend])

    if (backend !== currentBackendRef.current) return

    if (result.quotaExceeded) {
      handlePromptFailure(backend, result)
      setWarmupPhase('error')
      return
    }

    if (result.authRequired) {
      markAuthRequired(backend, result, { showModal: false })
      setWarmupPhase('error')
      return
    }

    if (result.success && result.sessionId) {
      const ready = await finalizeBackendSession(backend, {
        sessionId: result.sessionId,
        mode: result.mode || DEFAULT_AGENT_MODE,
      })
      if (!ready) {
        setWarmupPhase('error')
        return
      }
      log(`Switched to ${backend}`, 'success')
      return
    }

    if (!result.success) {
      setAgentStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(backend, 'error')
        return newMap
      })
      setStatus('error')
      setStatusText(t('status.error', { error: result.error || 'Unknown error' }))
      syncAcpConnection(backend, 'error', { error: result.error || 'Unknown error' })
      setWarmupPhase('error')
      log(`Failed to switch to ${backend}: ${result.error || 'Unknown error'}`, 'error')
    }
  }, [syncAllAgentStatuses, markAuthRequired, finalizeBackendSession, log, t, syncAcpConnection, handlePromptFailure])

  const selectAgent = useCallback((backend: string) => {
    const existingStatus = agentStatus.get(backend) || 'disconnected'
    if (currentBackend === backend && existingStatus === 'connected') {
      return
    }

    if (warmupTimerRef.current) {
      clearTimeout(warmupTimerRef.current)
      warmupTimerRef.current = null
    }

    setCurrentBackend(backend)
    currentBackendRef.current = backend
    void storageService.saveSettings({ lastAgentBackend: backend })
    const hasCachedMessages = (messagesRef.current.get(backend)?.length ?? 0) > 0
    if (!hasCachedMessages) {
      setMessagesPaneEpoch((n) => n + 1)
      setHistoryLoading(true)
    }
    setUserScrolled(false)
    dismissAuthModal()

    const agentName = detectedAgents.find(a => a.backend === backend)?.name || backend

    setMessages(prev => {
      const newMap = new Map(prev)
      if (!newMap.has(backend)) {
        newMap.set(backend, [])
      }
      messagesRef.current = newMap
      return newMap
    })

    log(`Selected agent: ${backend}`)

    const alreadyConnected = existingStatus === 'connected'
    const needsAuth = existingStatus === 'auth_required'
    setWarmupPhase(alreadyConnected ? 'ready' : needsAuth ? 'error' : 'idle')
    setAgentStatus(prev => {
      const newMap = new Map(prev)
      newMap.set(backend, alreadyConnected ? 'connected' : needsAuth ? 'auth_required' : 'disconnected')
      return newMap
    })
    setStatus(alreadyConnected ? 'connected' : needsAuth ? 'auth_required' : 'disconnected')
    setStatusText(
      alreadyConnected
        ? t('status.connected', { name: agentName })
        : needsAuth
          ? t('status.authRequired')
          : t('status.ready', { name: agentName }),
    )

    if (needsAuth) {
      void (async () => {
        const methods = (await window.electronAPI?.acp.getAuthMethods?.(backend)) || []
        if (backend !== currentBackendRef.current) return
        markAuthRequired(backend, { authMethods: methods }, { showModal: true })
      })()
    }

    void (async () => {
      if (needsAuth) return
      try {
        const health = await window.electronAPI?.acp.checkAgentHealth?.(backend)
        if (backend !== currentBackendRef.current) return

        if (health && !health.available) {
          if (health.needsAuth) {
            const methods = (await window.electronAPI?.acp.getAuthMethods?.(backend)) || []
            markAuthRequired(backend, { authMethods: methods, error: health.error }, { showModal: true })
          } else {
            setAgentStatus(prev => {
              const newMap = new Map(prev)
              newMap.set(backend, 'error')
              return newMap
            })
            setStatus('error')
            setStatusText(t('status.error', { error: health.error || t('status.disconnected') }))
            setWarmupPhase('error')
          }
          return
        }

        setWarmupPhase('preparing')
        setAgentStatus(prev => {
          const newMap = new Map(prev)
          newMap.set(backend, 'connecting')
          return newMap
        })
        setStatus('connecting')
        setStatusText(t('status.connecting', { name: agentName }))

        const result = await window.electronAPI?.acp.selectBackend(backend)
        if (backend !== currentBackendRef.current) return

        if (result?.sessionId) {
          await handleBackendReady(backend, result)
        } else if (result?.pending) {
          const pendingBackend = backend
          const deadline = Date.now() + 45_000
          const pollPending = async () => {
            if (pendingBackend !== currentBackendRef.current) return
            const snap = await window.electronAPI?.acp.getConnectionStatus?.(pendingBackend)
            const mapped = mapBackendSnapshotToStatus(snap)
            if (mapped === 'connected') {
              const info = await window.electronAPI?.acp.getSessionInfo?.(pendingBackend)
              if (info?.sessionId) {
                await handleBackendReady(pendingBackend, {
                  success: true,
                  sessionId: info.sessionId,
                  mode: info.mode,
                })
              }
              return
            }
            if (mapped === 'auth_required') {
              const methods = (await window.electronAPI?.acp.getAuthMethods?.(pendingBackend)) || []
              markAuthRequired(pendingBackend, { authMethods: methods }, { showModal: true })
              return
            }
            if (mapped === 'error') {
              void syncAllAgentStatuses([pendingBackend])
              return
            }
            if (Date.now() < deadline) {
              setTimeout(() => void pollPending(), 2000)
            } else {
              await handleBackendReady(pendingBackend, {
                success: false,
                error: t('status.connectionTimeout', { name: agentName }),
              })
            }
          }
          setTimeout(() => void pollPending(), 2000)
        } else if (!result?.success) {
          await handleBackendReady(backend, { success: false, error: result?.error })
        }
      } catch (err: any) {
        if (backend !== currentBackendRef.current) return
        setAgentStatus(prev => {
          const newMap = new Map(prev)
          newMap.set(backend, 'error')
          return newMap
        })
        setStatus('error')
        setStatusText(t('status.error', { error: err.message }))
        syncAcpConnection(backend, 'error', { error: err.message })
        setWarmupPhase('error')
        log(`Switch error: ${err.message}`, 'error')
      }
    })()

    if (!(messagesRef.current.get(backend)?.length)) {
      void loadAgentHistory(backend, { silent: hasStartupHistoryCache(backend) })
    } else {
      setUserScrolled(false)
      scrollToLatestMessages(true)
    }
  }, [currentBackend, agentStatus, log, syncAcpConnection, t, detectedAgents, scrollToLatestMessages, dismissAuthModal, loadAgentHistory, handleBackendReady, syncAllAgentStatuses, markAuthRequired])

  const connectInBackground = useCallback(async (backend: string, options?: { freshSession?: boolean }) => {
    if (!options?.freshSession) {
      const existing = warmupPromiseRef.current.get(backend)
      if (existing) return existing
    }

    const run = async () => {
    const isActive = backend === currentBackendRef.current

    const existing = await window.electronAPI?.acp.getConnectionStatus?.(backend)
    if (!options?.freshSession && mapBackendSnapshotToStatus(existing) === 'connected') {
      if (isActive) {
        const info = await window.electronAPI?.acp.getSessionInfo?.(backend)
        if (info?.sessionId) {
          await finalizeBackendSession(backend, { sessionId: info.sessionId })
        }
      }
      return
    }

    if (isActive) {
      setWarmupPhase('preparing')
    }
    setAgentStatus(prev => {
      const newMap = new Map(prev)
      newMap.set(backend, 'connecting')
      return newMap
    })

    if (isActive) {
      setStatus('connecting')
      setStatusText(t('status.connecting', { name: detectedAgents.find(a => a.backend === backend)?.name || backend }))
    }
    
    try {
      log(`Ensuring session for ${backend}...`)

      const sessionResult = await window.electronAPI?.acp.ensureSession?.(
        backend,
        { freshSession: options?.freshSession },
      )
      if (sessionResult?.authRequired) {
        markAuthRequired(backend, sessionResult, { showModal: isActive })
        if (isActive) setWarmupPhase('error')
        return
      }
      if (sessionResult?.quotaExceeded) {
        if (isActive) handlePromptFailure(backend, sessionResult)
        if (isActive) setWarmupPhase('error')
        return
      }
      if (!sessionResult?.success || !sessionResult?.sessionId) {
        throw new Error(sessionResult?.error || 'Failed to create session')
      }

      const ready = await finalizeBackendSession(backend, {
        sessionId: sessionResult.sessionId,
        resumed: sessionResult.resumed,
        mode: sessionResult.mode,
      })
      if (!ready) {
        if (isActive) setWarmupPhase('error')
        return
      }

      log(`${backend} connected successfully!`, 'success')

      if (backend === currentBackendRef.current && !(messagesRef.current.get(backend)?.length)) {
        void loadAgentHistory(backend)
      }
      
      if (backend === currentBackendRef.current) {
        setUserScrolled(false)
        scrollToLatestMessages(true)
      }
      
    } catch (err: any) {
      if (isActive) setWarmupPhase('error')
      setAgentStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(backend, 'error')
        return newMap
      })
      await syncAllAgentStatuses([backend])
      if (backend === currentBackendRef.current) {
        setStatus('error')
        setStatusText(t('status.error', { error: err.message }))
        const alternateHint = formatAlternateAgentHint(backend)
        if (alternateHint) {
          setFailureHint({ action: 'switch_agent', backend })
        }
      }
      log(`${backend} connection failed: ${err.message}`, 'error')
    }
    }

    const promise = run().finally(() => {
      warmupPromiseRef.current.delete(backend)
    })
    warmupPromiseRef.current.set(backend, promise)
    return promise
  }, [log, convertHistoryMessage, finalizeBackendSession, t, markAuthRequired, scrollToLatestMessages, detectedAgents, syncAllAgentStatuses, formatAlternateAgentHint, loadAgentHistory, handlePromptFailure])

  const warmupBackend = useCallback(async (backend?: string | null) => {
    const target = backend ?? currentBackendRef.current
    if (!target) return

    const snapshot = await window.electronAPI?.acp.getConnectionStatus?.(target)
    const mapped = mapBackendSnapshotToStatus(snapshot)
    if (mapped === 'connected' || mapped === 'auth_required') return

    return connectInBackground(target)
  }, [connectInBackground])

  const ensureBackendReady = useCallback(async (): Promise<boolean> => {
    const backend = currentBackendRef.current
    if (!backend) return false

    const snapshot = await window.electronAPI?.acp.getConnectionStatus?.(backend)
    let mapped = mapBackendSnapshotToStatus(snapshot)
    if (mapped === 'connected') return true
    if (mapped === 'error') {
      log(snapshot?.error || t('status.disconnected'), 'error')
      applyConnectionSnapshot(backend, snapshot || { connected: false, hasSession: false, ready: false, needsAuth: false })
      return false
    }
    if (mapped === 'auth_required') {
      const methods = (await window.electronAPI?.acp.getAuthMethods?.(backend)) || []
      markAuthRequired(backend, { authMethods: methods }, { showModal: true })
      return false
    }

    await warmupBackend(backend)
    const after = await window.electronAPI?.acp.getConnectionStatus?.(backend)
    mapped = mapBackendSnapshotToStatus(after)
    if (mapped === 'error') {
      log(after?.error || t('status.disconnected'), 'error')
      if (after) applyConnectionSnapshot(backend, after)
      return false
    }
    if (mapped === 'auth_required') {
      const methods = (await window.electronAPI?.acp.getAuthMethods?.(backend)) || []
      markAuthRequired(backend, { authMethods: methods }, { showModal: true })
      return false
    }
    return mapped === 'connected'
  }, [warmupBackend, markAuthRequired, applyConnectionSnapshot, log, t])

  connectInBackgroundRef.current = connectInBackground

  const persistAgentToolbarCache = useCallback((agents: AgentInfo[], backend: string | null) => {
    if (agents.length === 0) return
    void storageService.saveSettings(buildAgentToolbarCachePatch(agents, backend))
  }, [])

  const applyDetectedAgents = useCallback(
    (agents: AgentInfo[], options?: { preferBackend?: string | null; refreshOnly?: boolean }) => {
      setDetectedAgents(agents)
      dispatch({
        type: 'SET_ACP_BACKENDS',
        payload: agents.map((a) => ({
          id: a.backend,
          name: a.name,
          cliCommand: a.cliPath,
          acpArgs: a.acpArgs,
          logo: a.logo,
        })),
      })

      if (agents.length === 0) {
        setCurrentBackend(null)
        currentBackendRef.current = null
        setStatus('disconnected')
        setStatusText(t('status.noAgents'))
        return
      }

      setAgentStatus((prev) => {
        const next = new Map<string, AgentConnStatus>()
        for (const agent of agents) {
          next.set(agent.backend, prev.get(agent.backend) || 'disconnected')
        }
        return next
      })

      const preferred =
        (options?.preferBackend && agents.some((a) => a.backend === options.preferBackend)
          ? options.preferBackend
          : null) ||
        (currentBackendRef.current && agents.some((a) => a.backend === currentBackendRef.current)
          ? currentBackendRef.current
          : agents[0].backend)

      const target = agents.find((a) => a.backend === preferred) || agents[0]
      const switching = currentBackendRef.current !== target.backend

      setCurrentBackend(target.backend)
      currentBackendRef.current = target.backend
      persistAgentToolbarCache(agents, target.backend)

      if (options?.refreshOnly && !switching) {
        setStatusText(t('status.ready', { name: target.name }))
        return
      }

      setStatus('disconnected')
      setStatusText(t('status.ready', { name: target.name }))

      if (switching) {
        void loadAgentHistory(target.backend, { silent: hasStartupHistoryCache(target.backend) })
        void window.electronAPI?.acp.selectBackend(target.backend).then((result) => {
          if (result?.sessionId) {
            void handleBackendReady(target.backend, result)
          }
        })
      }
    },
    [dispatch, t, loadAgentHistory, handleBackendReady, persistAgentToolbarCache],
  )

  const handleRescanAgents = useCallback(async () => {
    if (!window.electronAPI?.acp?.refreshAgents) return
    setRescanningAgents(true)
    try {
      const refreshed = await window.electronAPI.acp.refreshAgents()
      if (Array.isArray(refreshed)) {
        applyDetectedAgents(refreshed as AgentInfo[], {
          preferBackend: currentBackendRef.current,
          refreshOnly: true,
        })
      }
      void syncAllAgentStatuses()
    } catch {
      // best-effort rescan
    } finally {
      setRescanningAgents(false)
    }
  }, [applyDetectedAgents, syncAllAgentStatuses])

  const handleCliInstallClose = useCallback(() => {
    setCliInstallOpen(false)
    void handleRescanAgents()
  }, [handleRescanAgents])

  const initHooksRef = useRef({
    applyDetectedAgents,
    handleBackendReady,
    loadAgentHistory,
    applyHistoryBatch,
    applyHistoryMeta,
    syncAllAgentStatuses,
    log,
    t,
    dispatch,
  })
  initHooksRef.current = {
    applyDetectedAgents,
    handleBackendReady,
    loadAgentHistory,
    applyHistoryBatch,
    applyHistoryMeta,
    syncAllAgentStatuses,
    log,
    t,
    dispatch,
  }

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const {
        applyDetectedAgents: applyAgents,
        handleBackendReady: onBackendReady,
        loadAgentHistory: loadHistory,
        applyHistoryBatch,
        applyHistoryMeta,
        syncAllAgentStatuses: syncStatuses,
        log: writeLog,
        t: translate,
        dispatch: appDispatch,
      } = initHooksRef.current

      const applyStartupHistoryCache = (backend: string | null | undefined): boolean => {
        if (!backend) return false
        const cache = consumeStartupHistoryCache(backend)
        if (!cache) return false
        applyHistoryMeta(backend, cache.total, cache.hasMore)
        applyHistoryBatch(backend, cache.messages as Message[], cache.hasMore ?? false)
        return true
      }

      const hadCachedAgents = bootSnapshot.agents.length > 0
      const e2eNoAgents = isE2ENoAgentsMode()
      const startupBackendHint =
        (window as Window & { __METAMATES_STARTUP_BACKEND__?: string }).__METAMATES_STARTUP_BACKEND__
        || bootSnapshot.lastBackend

      if (applyStartupHistoryCache(startupBackendHint)) {
        // History hydrated from splash — no vault loading copy in main UI.
      } else if (hadCachedAgents) {
        const name =
          bootSnapshot.agents.find((a) => a.backend === bootSnapshot.lastBackend)?.name ||
          bootSnapshot.agents[0]?.name ||
          ''
        if (name) setStatusText(translate('status.ready', { name }))
        if (bootSnapshot.lastBackend) {
          void loadHistory(bootSnapshot.lastBackend, { silent: true })
        }
      } else {
        setStatusText(translate('status.detecting'))
      }

      try {
        if (e2eNoAgents) {
          applyAgents([])
          setStatusText(translate('status.noAgents'))
          if (!cancelled) setAgentsScanReady(true)
          return
        }

        let workspacePath = state.workspacePath

        if (!workspacePath) {
          const settings = await storageService.getSettings()
          workspacePath = settings.workspacePath || ''
        }

        if (workspacePath && !state.workspacePath && window.electronAPI) {
          const exists = await window.electronAPI.fileExists(workspacePath)
          if (exists.exists) {
            appDispatch({ type: 'SET_WORKSPACE', payload: workspacePath })
          }
        }

        const settings = await storageService.getSettings()
        const startupBackend = (window as Window & { __METAMATES_STARTUP_BACKEND__?: string })
          .__METAMATES_STARTUP_BACKEND__
        const preferBackend = startupBackend || settings.lastAgentBackend || bootSnapshot.lastBackend

        let agents = await fetchAgentsWithRetry()
        if (agents.length === 0 && !e2eNoAgents) {
          for (let wave = 0; wave < 8 && !cancelled; wave++) {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            try {
              const refreshed = await window.electronAPI?.acp?.refreshAgents?.()
              if (Array.isArray(refreshed) && refreshed.length > 0) {
                agents = refreshed as AgentInfo[]
                break
              }
            } catch {
              // IPC may still be warming up on cold Electron start
            }
          }
        }
        if (cancelled) return

        writeLog(`Detected ${agents.length} CLI(s): ${agents.map((a) => a.name).join(', ') || '(none)'}`)

        if (agents.length > 0) {
          applyAgents(agents, { preferBackend, refreshOnly: hadCachedAgents })

          const activeBackend = preferBackend && agents.some((a) => a.backend === preferBackend)
            ? preferBackend
            : agents[0].backend

          if (!applyStartupHistoryCache(activeBackend)) {
            void loadHistory(activeBackend, { silent: true })
          }

          const statusSnapshot = await window.electronAPI?.acp.getConnectionStatus?.(activeBackend)
          const mappedStatus = mapBackendSnapshotToStatus(statusSnapshot)
          if (mappedStatus === 'connected' && statusSnapshot?.hasSession) {
            const sessionInfo = await window.electronAPI?.acp.getSessionInfo?.(activeBackend)
            if (sessionInfo?.sessionId) {
              setWarmupPhase('ready')
              setAgentStatus((prev) => {
                const next = new Map(prev)
                next.set(activeBackend, 'connected')
                return next
              })
              setStatus('connected')
              const name = agents.find((a) => a.backend === activeBackend)?.name || activeBackend
              setStatusText(translate('status.connected', { name }))
              void onBackendReady(activeBackend, {
                success: true,
                sessionId: sessionInfo.sessionId,
                mode: sessionInfo.mode || DEFAULT_AGENT_MODE,
              })
            }
          } else {
            setWarmupPhase('idle')
          }

          void window.electronAPI?.acp.selectBackend(activeBackend).then((result) => {
            if (result?.sessionId) {
              void onBackendReady(activeBackend, result)
            }
          })
          void warmupBackend(activeBackend)

          const prefetchOthers = () => {
            for (const agent of agents) {
              if (agent.backend !== activeBackend) {
                void loadHistory(agent.backend, { silent: true })
              }
            }
          }
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(prefetchOthers, { timeout: 5000 })
          } else {
            setTimeout(prefetchOthers, 2000)
          }
        } else {
          applyAgents([])
        }

        if (!cancelled) setAgentsScanReady(true)

        window.setTimeout(async () => {
          if (cancelled || e2eNoAgents) return
          const refresh = window.electronAPI?.acp?.refreshAgents
          if (!refresh) return
          try {
            const refreshed = await refresh()
            if (Array.isArray(refreshed) && refreshed.length > 0) {
              applyAgents(refreshed as AgentInfo[], {
                preferBackend: currentBackendRef.current,
                refreshOnly: true,
              })
            }
            void syncStatuses()
          } catch {
            // best-effort
          }
        }, 1200)
      } catch (err: any) {
        if (cancelled) return
        writeLog(`Init error: ${err.message}`, 'error')
        if (!hadCachedAgents) {
          setStatus('disconnected')
          setStatusText(translate('status.error', { error: err.message }))
        }
        setAgentsScanReady(true)
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [state.workspacePath, bootSnapshot])

  /** Apply session when background warmup completes (non-blocking switch). */
  useEffect(() => {
    const unsub = window.electronAPI?.acp.onBackendReady?.((data) => {
      void handleBackendReady(data.backend, data)
    })
    return () => unsub?.()
  }, [handleBackendReady])

  /** Reflect CLI enable/disable changes from settings panel. */
  useEffect(() => {
    const unsub = window.electronAPI?.acp.onCliAgentsChanged?.((data) => {
      if (!data?.agents || !Array.isArray(data.agents)) return
      applyDetectedAgents(data.agents as AgentInfo[], {
        preferBackend: currentBackendRef.current,
        refreshOnly: true,
      })
      void syncAllAgentStatuses()
    })
    return () => unsub?.()
  }, [applyDetectedAgents, syncAllAgentStatuses])

  /** Push-driven status updates (AionUi agent_status equivalent). */
  useEffect(() => {
    const api = window.electronAPI?.acp
    if (!api?.onConnectionStatusChange) return
    const unsub = api.onConnectionStatusChange((data) => {
      if (!data?.backend || !data.snapshot) return
      applyConnectionSnapshot(data.backend, data.snapshot as BackendConnectionSnapshot)
    })
    return () => unsub?.()
  }, [applyConnectionSnapshot])

  /** Sync pill state on events; light poll only while agents are still warming up. */
  useEffect(() => {
    if (detectedAgents.length === 0) return
    void syncAllAgentStatuses()

    const interval = setInterval(() => {
      const anyPending = detectedAgents.some((agent) => {
        const st = agentStatusRef.current.get(agent.backend) || 'disconnected'
        return st === 'connecting'
      })
      if (anyPending) void syncAllAgentStatuses()
    }, 8000)

    return () => clearInterval(interval)
  }, [detectedAgents, syncAllAgentStatuses])

  /** Finalize UI when current agent becomes ready via background warmup. */
  useEffect(() => {
    if (!currentBackend) return
    const st = agentStatus.get(currentBackend)
    if (st !== 'connected') return
    if (warmupPhase === 'ready' && sessionId) return

    void (async () => {
      const info = await window.electronAPI?.acp.getSessionInfo?.(currentBackend)
      if (!info?.sessionId || currentBackend !== currentBackendRef.current) return
      await finalizeBackendSession(currentBackend, {
        sessionId: info.sessionId,
        mode: info.mode || DEFAULT_AGENT_MODE,
      })
    })()
  }, [currentBackend, agentStatus, warmupPhase, sessionId, finalizeBackendSession])

  // Re-scan PATH when user returns (e.g. installed a CLI while app was open)
  useEffect(() => {
    const refreshAgentList = async () => {
      const refresh = window.electronAPI?.acp?.refreshAgents
      if (!refresh) return
      try {
        const agents = await refresh()
        if (!agents || !Array.isArray(agents)) return
        applyDetectedAgents(agents as AgentInfo[])
      } catch {
        // ignore focus refresh errors
      }
      void syncAllAgentStatuses()
    }
    const onFocus = () => {
      const now = Date.now()
      if (now - lastAgentRefreshRef.current < 30_000) {
        void syncAllAgentStatuses()
      } else {
        lastAgentRefreshRef.current = now
        void refreshAgentList()
      }
      void (async () => {
        const check = window.electronAPI?.acp?.checkGeminiAuth
        if (!check) return
        try {
          const { authenticated } = await check()
          if (!authenticated) return
          if (agentStatusRef.current.get('gemini') !== 'auth_required') return
          await connectInBackgroundRef.current?.('gemini', { freshSession: true })
          void syncAllAgentStatuses()
        } catch {
          // ignore gemini auth refresh errors
        }
      })()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [applyDetectedAgents, syncAllAgentStatuses])

  useEffect(() => {
    if (!state.workspacePath || state.workspacePath === workspacePathRef.current) {
      return
    }

    const newPath = state.workspacePath
    const previousPath = workspacePathRef.current
    workspacePathRef.current = newPath
    const isFirstBind = !previousPath

    if (!isFirstBind) {
      setMessages(new Map())
      messagesRef.current = new Map()
      setHistoryHasMore(new Map())
      historyFetchRef.current.clear()
      setHistoryTotals(new Map())
      setMessagesPaneEpoch((n) => n + 1)

      const workspaceLabel = newPath.split(/[/\\]/).pop() || newPath
      message.info(t('workspace.switched', { path: workspaceLabel }))
    }

    void (async () => {
      await window.electronAPI?.acp.setWorkspacePath(newPath)
      log(`Workspace updated to: ${newPath}`)

      const activeBackend = currentBackendRef.current
      if (activeBackend) {
        reconnectAttemptRef.current = 0
        setWarmupPhase('idle')
        await loadAgentHistory(activeBackend, { force: !isFirstBind, silent: isFirstBind })
      }
    })()
  }, [state.workspacePath, log, loadAgentHistory, t])

  useEffect(() => {
    const checkDb = async () => {
      const status = await window.electronAPI?.getDatabaseStatus?.()
      setChatDbUnavailable(status?.available === false)
    }
    void checkDb()
  }, [state.workspacePath])

  useEffect(() => () => {
    if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current)
  }, [])

  useEffect(() => {
    const handleStreamMessage = (data: { backend: string; message: IResponseMessage }) => {
      const { backend, message } = data
      handleControlMessage(message, backend, currentBackendRef.current || '')

      if (message.type === 'error') {
        const errData = message.data as { message?: string }
        finalizeStreamingTurn(backend)
        if (backend === currentBackendRef.current) {
          handlePromptFailure(backend, { error: errData?.message || 'unknown' })
        }
        return
      }

      const { messages: nextList, sideEffects } = applyStreamMessage(
        messagesRef.current.get(backend) || [],
        message,
      )

      if (sideEffects.availableCommands) {
        setAcpDynamicCommands(sideEffects.availableCommands)
      }

      setMessages(prev => {
        const newMap = new Map(prev)
        newMap.set(backend, nextList as Message[])
        messagesRef.current = newMap
        return newMap
      })

      const last = nextList[nextList.length - 1]
      if (last?.type === 'tool-call') {
        maybeAutoOpenToolFile(last as Message)
      }

      requestAnimationFrame(() => scrollToBottom())
    }

    const handleEndTurn = (data?: { backend?: string }) => {
      finalizeStreamingTurn(data?.backend)
      void runSlashWritebackVerifyRef.current(data?.backend)
    }
    
    const handleDisconnected = (data?: { backend?: string; intentional?: boolean }) => {
      const backend = data?.backend || currentBackendRef.current
      if (backend) {
        finalizeStreamingTurn(backend)
        setAgentStatus(prev => {
          const newMap = new Map(prev)
          newMap.set(backend, 'disconnected')
          return newMap
        })
      }
      if (backend && backend === currentBackendRef.current) {
        setStatus('disconnected')
        setStatusText(t('status.disconnected'))
        syncAcpConnection(backend, 'disconnected')
        dispatch({ type: 'SET_ACP_STREAMING', payload: false })
        log(`${backend} disconnected`, 'error')
      } else if (backend) {
        log(`${backend} disconnected (background)`, 'error')
      }
      void syncAllAgentStatuses()

      if (data?.intentional) {
        reconnectAttemptRef.current = 0
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        return
      }

      const reconnectBackend = backend === currentBackendRef.current ? backend : null
      if (reconnectBackend && !reconnectTimerRef.current) {
        const attempt = reconnectAttemptRef.current
        if (attempt >= RECONNECT_DELAYS_MS.length) {
          log('Reconnect attempts exhausted', 'error')
          setFailureHint({ action: 'reconnect', backend: reconnectBackend })
          return
        }
        const delay = RECONNECT_DELAYS_MS[attempt]
        reconnectAttemptRef.current = attempt + 1
        log(`Reconnect in ${delay / 1000}s (attempt ${attempt + 1})...`, 'info')
        reconnectTimerRef.current = setTimeout(async () => {
          reconnectTimerRef.current = null
          try {
            await connectInBackgroundRef.current(reconnectBackend)
          } catch (e: any) {
            log(`Reconnect failed: ${e.message}`, 'error')
          }
        }, delay)
      }
    }
    
    const handlePermissionRequest = (data: any) => {
      log(`Permission request: ${data.toolCall?.title || 'Unknown tool'}`, 'info')
      
      const requestId = data.requestId
      const options = (data.options || []).map((o: any) => ({
        optionId: o.optionId || o.option_id || o.id,
        name: o.name || o.title || o.optionId || o.id,
        kind: o.kind,
      }))
      const autoApprove = isAutoApproveMode(selectedMode)
      
      if (autoApprove && options.length > 0) {
        const optionId = pickAllowPermissionOption(options)
        log(`Auto-approving (yolo): ${optionId}`, 'success')
        window.electronAPI?.acp.respondToPermission(data.backend, requestId, optionId)
        return
      }

      if (options.length > 0) {
        setPendingPermission({
          backend: data.backend,
          requestId,
          toolCall: data.toolCall,
          options,
        })
      }
    }
    
    window.electronAPI?.acp.onAcpStreamMessage(handleStreamMessage)
    window.electronAPI?.acp.onEndTurn(handleEndTurn)
    window.electronAPI?.acp.onDisconnected(handleDisconnected)
    window.electronAPI?.acp.onPermissionRequest(handlePermissionRequest)
    
    return () => {
      window.electronAPI?.acp.removeListeners()
    }
  }, [finalizeStreamingTurn, handleControlMessage, handlePromptFailure, log, dispatch, syncAcpConnection, selectedMode, maybeAutoOpenToolFile, scrollToBottom])

  const dismissPermissionModal = useCallback(() => {
    if (!pendingPermission) return
    window.electronAPI?.acp.rejectPermission?.(
      pendingPermission.backend,
      pendingPermission.requestId,
    )
    setPendingPermission(null)
    log('Permission dismissed (rejected)', 'info')
  }, [pendingPermission, log])

  const respondToPermissionChoice = useCallback((optionId: string) => {
    if (!pendingPermission) return
    window.electronAPI?.acp.respondToPermission(
      pendingPermission.backend,
      pendingPermission.requestId,
      optionId
    )
    setPendingPermission(null)
    log(`Permission: ${optionId}`, 'success')
  }, [pendingPermission, log])

  const handleAuthenticate = useCallback(async (methodId?: string, apiKey?: string) => {
    if (!pendingAuth || authInProgress) return
    const { backend } = pendingAuth
    setAuthInProgress(true)
    log(`Authenticating ${backend}...`, 'info')
    try {
      const meta = apiKey?.trim() ? { 'api-key': apiKey.trim() } : undefined
      const result = await window.electronAPI?.acp.authenticate(backend, methodId, meta)
      if (result?.success && result.sessionId) {
        setPendingAuth(null)
        setShowApiKeyInput(false)
        setApiKeyInput('')
        const ready = await finalizeBackendSession(backend, { sessionId: result.sessionId })
        if (ready) {
          log(`${backend} authenticated`, 'success')
        }
      } else {
        setPendingAuth(prev => prev ? { ...prev, error: result?.error || t('status.error', { error: 'unknown' }) } : null)
        log(`Auth failed: ${result?.error || 'unknown'}`, 'error')
      }
    } catch (err: any) {
      setPendingAuth(prev => prev ? { ...prev, error: err.message } : null)
      log(`Auth error: ${err.message}`, 'error')
    } finally {
      setAuthInProgress(false)
    }
  }, [pendingAuth, authInProgress, log, finalizeBackendSession, t])

  const handleGeminiTerminalLogin = useCallback(async () => {
    log('Opening Gemini login in PowerShell...', 'info')
    const result = await window.electronAPI?.acp.openGeminiTerminalLogin()
    if (!result?.success) {
      message.error(result?.error || t('auth.terminalLoginFailed'))
      log(`Terminal login failed: ${result?.error || 'unknown'}`, 'error')
    }
  }, [log, t])

  const handleAuthMethodClick = useCallback((methodId: string) => {
    if (methodId === 'gemini-api-key') {
      setShowApiKeyInput(true)
      return
    }
    if (pendingAuth?.backend === 'gemini' && isGoogleOAuthMethod(methodId)) {
      void handleGeminiTerminalLogin()
    }
    void handleAuthenticate(methodId)
  }, [handleAuthenticate, handleGeminiTerminalLogin, pendingAuth?.backend])

  useEffect(() => {
    if (!window.electronAPI?.acp?.onAuthUrl) return undefined
    const unsubscribe = window.electronAPI.acp.onAuthUrl((data) => {
      if (pendingAuth?.backend === data.backend) {
        setPendingAuthUrl(data.url)
      }
    })
    return unsubscribe
  }, [pendingAuth?.backend])

  useEffect(() => {
    if (!window.electronAPI?.acp?.onAuthDeprecated) return undefined
    const unsubscribe = window.electronAPI.acp.onAuthDeprecated((data) => {
      if (pendingAuth?.backend === data.backend) {
        setPendingAuth(prev => prev ? { ...prev, error: data.message } : null)
        if (data.backend === 'gemini') {
          void handleGeminiTerminalLogin()
        }
      }
    })
    return unsubscribe
  }, [pendingAuth?.backend, handleGeminiTerminalLogin])

  const sendMessage = useCallback(async (text: string, attachments: ChatAttachment[] = []) => {
    if (!text.trim() && attachments.length === 0 && currentCommand?.inputMode !== 'optional') return

    const activeCommand = currentCommand
    setCurrentCommand(null)

    const isIntelCapture =
      activeCommand?.localHandler === 'intelligence' ||
      (!activeCommand && shouldCaptureAsIntelligence(text))

    if (isIntelCapture) {
      if (!state.workspacePath) {
        message.warning(t('messages.noWorkspace'))
        return
      }

      const captureInput = text.trim()
      if (activeCommand?.localHandler === 'intelligence' && !captureInput && attachments.length === 0) {
        message.warning(t('messages.intelNeedInput'))
        setCurrentCommand(activeCommand)
        return
      }

      const language = getWorkspaceLanguage(i18n.language)
      const attachmentLabel = attachments.length > 0
        ? attachments.map((a) => a.name).join(', ')
        : ''
      const displayText = activeCommand
        ? [
            text.trim() ? `/intel ${text.trim()}` : '/intel',
            attachmentLabel ? `📎 ${attachmentLabel}` : '',
          ].filter(Boolean).join(' ')
        : text.trim()
      const backend = currentBackend || ''

      appendUserBubble(backend, displayText, attachments.length > 0 ? attachments : undefined)

      const ready = await ensureBackendReady()
      if (!ready) {
        log(t('messages.connectFirst'), 'error')
        return
      }

      markSlashWritebackPending(activeCommand?.id || '/intel')

      try {
        const result = await captureIntelligenceFromInput(
          state.workspacePath,
          {
            text: captureInput || displayText,
            attachmentPaths: attachments.map((a) => a.path),
          },
          language,
        )
        if (!result.success) {
          pendingSlashVerifyRef.current = null
          if (result.error !== 'canceled') {
            log(result.error || t('messages.intelFailed'), 'error')
          }
          return
        }

        if (result.notePath && result.noteName) {
          dispatch({
            type: 'ADD_TAB',
            payload: { path: result.notePath, name: result.noteName, isDirty: false },
          })
        }

        log(t('messages.intelCreated', { name: result.noteName || '' }), 'success')

        const excerpt = result.extractedPreview || ''
        if (excerpt && window.electronAPI?.acp) {
          currentMsgIdRef.current = `msg-${Date.now()}`
          setUserScrolled(false)

          const enhancePrompt = buildIntelligenceEnhancePrompt(result, excerpt, language)
          const agentResult = await window.electronAPI.acp.sendPrompt(
            enhancePrompt,
            null,
            [],
            t('messages.intelEnhancing'),
          )
          if (agentResult && agentResult.success === false) {
            handlePromptFailure(backend, agentResult)
          }
        }
      } catch (err: any) {
        log(err?.message || t('messages.intelFailed'), 'error')
      }
      return
    }

    const attachmentResult = await buildAttachmentContext(attachments)
    if (attachmentResult.truncated) {
      message.warning(t('input.attachTruncated', { max: 8000 }))
    }
    const attachmentContext = attachmentResult.context
    const contextLines: string[] = []
    const timezone = getEffectiveTimezone()
    contextLines.push(`Timezone: ${timezone}`)
    contextLines.push(`Local time: ${formatNowInTimezone(timezone)}`)
    contextLines.push(`Today (YYYY-MM-DD): ${getTodayDateString(timezone)}`)
    if (state.workspacePath) {
      contextLines.push(`Workspace: ${state.workspacePath}`)
    }
    if (state.currentFile) {
      contextLines.push(`Current file: ${state.currentFile}`)
    }
    if (attachmentContext) {
      contextLines.push('', '[Attached workspace files]', attachmentContext)
    }
    const presetContext = contextLines.length > 0
      ? `[Assistant Context - use when relevant]\n${contextLines.join('\n')}`
      : null

    const displayText = activeCommand
      ? (
        activeCommand.inputMode === 'none'
          ? `/${activeCommand.name}`
          : text.trim()
            ? `/${activeCommand.name} ${text.trim()}`
            : `/${activeCommand.name}`
      )
      : text.trim()
    const serializedAttachments = attachments.length > 0
      ? attachments.map(({ path, name }) => ({ path, name }))
      : undefined
    const backend = currentBackend || ''

    const ready = await ensureBackendReady()
    if (!ready) {
      log('Agent not ready — complete sign-in or wait for connection', 'error')
      return
    }

    try {
      appendUserBubble(backend, displayText, serializedAttachments)
      currentMsgIdRef.current = `msg-${Date.now()}`
      setUserScrolled(false)

      if (activeCommand) {
        markSlashWritebackPending(activeCommand.id)
      }

      const finalPrompt = activeCommand
        ? await loadSlashPrompt(activeCommand, text.trim())
        : text.trim()

      const result = await window.electronAPI?.acp.sendPrompt(
        finalPrompt,
        activeCommand ? null : presetContext,
        serializedAttachments,
        displayText,
      )
      if (result && result.success === false) {
        handlePromptFailure(backend, result)
        return
      }
      log('Message sent!', 'success')
    } catch (err: any) {
      handlePromptFailure(backend, err)
    }
  }, [currentCommand, currentBackend, appendUserBubble, log, dispatch, state.workspacePath, state.currentFile, ensureBackendReady, loadSlashPrompt, handlePromptFailure, i18n.language, t, markSlashWritebackPending])

  const sendCommandDirectly = useCallback(async (cmd: AgentSlashCommand) => {
    const displayText = `/${cmd.name}`
    const backend = currentBackend || ''

    const ready = await ensureBackendReady()
    if (!ready) {
      log('Agent not ready — complete sign-in or wait for connection', 'error')
      return
    }

    try {
      appendUserBubble(backend, displayText)
      currentMsgIdRef.current = `msg-${Date.now()}`
      setUserScrolled(false)
      markSlashWritebackPending(cmd.id)

      const finalPrompt = await loadSlashPrompt(cmd, '')
      const result = await window.electronAPI?.acp.sendPrompt(finalPrompt, null, [], displayText)
      if (result && result.success === false) {
        handlePromptFailure(backend, result)
        return
      }
      log(`${cmd.name} executed!`, 'success')
    } catch (err: any) {
      handlePromptFailure(backend, err)
    }
  }, [currentBackend, appendUserBubble, log, dispatch, ensureBackendReady, loadSlashPrompt, handlePromptFailure, markSlashWritebackPending])

  const handleCommandClick = useCallback((cmd: AgentSlashCommand) => {
    if (cmd.inputMode === 'required' || cmd.inputMode === 'optional') {
      setCurrentCommand(cmd)
    } else {
      setCurrentCommand(null)
      sendCommandDirectly(cmd)
    }
  }, [sendCommandDirectly])

  useEffect(() => {
    const onFocusAgent = () => {
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>('.agent-panel__footer textarea')
        input?.focus()
        input?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
    const onRunSlash = (event: Event) => {
      const detail = (event as CustomEvent<RunSlashDetail>).detail
      if (!detail?.name) return
      const cmd = slashCommands.find((item) => item.name === detail.name)
      if (!cmd) return
      if (detail.autoSend) {
        void sendCommandDirectly(cmd)
      } else {
        handleCommandClick(cmd)
      }
      onFocusAgent()
    }
    window.addEventListener('metamates:focus-agent', onFocusAgent)
    window.addEventListener('metamates:run-slash', onRunSlash)
    const onOpenCliInstall = () => setCliInstallOpen(true)
    window.addEventListener('metamates:open-cli-install', onOpenCliInstall)
    return () => {
      window.removeEventListener('metamates:focus-agent', onFocusAgent)
      window.removeEventListener('metamates:run-slash', onRunSlash)
      window.removeEventListener('metamates:open-cli-install', onOpenCliInstall)
    }
  }, [slashCommands, sendCommandDirectly, handleCommandClick])

  const handleModelChange = useCallback(async (modelId: string) => {
    if (!modelId) return
    const backend = currentBackendRef.current
    try {
      await window.electronAPI?.acp.setModel(modelId)
      setSelectedModel(modelId)
      if (backend) void persistAcpPreference(backend, { modelId })
      log(`Model: ${modelId}`, 'success')
    } catch (err: any) {
      log(`Model change failed: ${err.message}`, 'error')
    }
  }, [log, persistAcpPreference])

  const handleManualReconnect = useCallback(() => {
    const backend = currentBackendRef.current
    if (!backend) return
    reconnectAttemptRef.current = 0
    setFailureHint(null)
    void connectInBackground(backend)
  }, [connectInBackground])

  const applyModeChange = useCallback(async (mode: string) => {
    const backend = currentBackendRef.current
    try {
      await window.electronAPI?.acp.setMode(mode)
      setSelectedMode(mode)
      if (backend) void persistAcpPreference(backend, { mode })
      syncAcpConnection(backend || 'default', 'connected', { mode })
      log(`Mode: ${mode}`, 'success')
    } catch (err: any) {
      log(`Mode change failed: ${err.message}`, 'error')
    }
  }, [log, syncAcpConnection, persistAcpPreference])

  const handleModeChange = useCallback(async (mode: string) => {
    if (isAutoApproveMode(mode) && !isAutoApproveMode(selectedMode)) {
      setPendingYoloMode(mode)
      return
    }
    await applyModeChange(mode)
  }, [selectedMode, applyModeChange])

  const confirmYoloMode = useCallback(async () => {
    if (pendingYoloMode) {
      const mode = pendingYoloMode
      setPendingYoloMode(null)
      acknowledgeYoloMode()
      await applyModeChange(mode)
      return
    }
    if (yoloFirstRunPrompt) {
      setYoloFirstRunPrompt(false)
      acknowledgeYoloMode()
    }
  }, [pendingYoloMode, yoloFirstRunPrompt, applyModeChange])

  const cancelYoloMode = useCallback(async () => {
    if (pendingYoloMode) {
      setPendingYoloMode(null)
      return
    }
    if (yoloFirstRunPrompt) {
      setYoloFirstRunPrompt(false)
      acknowledgeYoloMode()
      await applyModeChange('default')
    }
  }, [pendingYoloMode, yoloFirstRunPrompt, applyModeChange])

  const currentMessages = useMemo(
    () => (messages.get(currentBackend || '') || []).filter(isVisibleChatMessage),
    [messages, currentBackend]
  )

  const currentAgent = useMemo(
    () => detectedAgents.find((agent) => agent.backend === currentBackend) || null,
    [detectedAgents, currentBackend]
  )

  const connectionStatus = useMemo(() => {
    if (!currentBackend) return status
    return agentStatus.get(currentBackend) || status
  }, [currentBackend, agentStatus, status])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    if (!isAutoApproveMode(selectedMode)) return
    if (shouldSkipYoloFirstRunPrompt()) return
    if (pendingYoloMode) return
    setYoloFirstRunPrompt(true)
  }, [connectionStatus, selectedMode, pendingYoloMode])

  const showEmptyAgentPanel = agentsScanReady && detectedAgents.length === 0
  const showAgentScanPlaceholder = !agentsScanReady && detectedAgents.length === 0

  useEffect(() => {
    if (bootSnapshot.agents.length === 0) return
    dispatch({
      type: 'SET_ACP_BACKENDS',
      payload: bootSnapshot.agents.map((a) => ({
        id: a.backend,
        name: a.name,
        cliCommand: a.cliPath,
        acpArgs: a.acpArgs,
        logo: a.logo,
      })),
    })
  }, [bootSnapshot, dispatch])

  const showVaultContext = detectedAgents.length > 0
    && currentMessages.length === 0
    && connectionStatus === 'connected'

  const modeOptions = useMemo(
    () => getModeOptionsForBackend(currentBackend),
    [currentBackend],
  )

  const showLoadEarlier = useMemo(() => {
    if (!currentBackend) return false
    return historyHasMore.get(currentBackend) === true
  }, [currentBackend, historyHasMore])

  const historyTotal = currentBackend ? historyTotals.get(currentBackend) : undefined
  const loadedMessageCount = currentMessages.length

  const showThinkingPlaceholder = useMemo(() => {
    if (!state.acp.isStreaming) return false
    const list = currentMessages
    if (list.length === 0) return true
    const last = list[list.length - 1]
    if (last.type === 'user') return true
    if (last.type === 'agent' && last.status === 'streaming' && !last.content?.trim()) return true
    return false
  }, [state.acp.isStreaming, currentMessages])

  const hasInProgressTools = useMemo(
    () => currentMessages.some((m) => m.type === 'tool-call' && isToolCallInProgress(m.status)),
    [currentMessages],
  )

  const isAgentBusy = state.acp.isStreaming || hasInProgressTools

  useEffect(() => {
    if (showThinkingPlaceholder && !userScrolled) {
      scrollToLatestMessages(true)
    }
  }, [showThinkingPlaceholder, userScrolled, scrollToLatestMessages])

  const inputPlaceholder = useMemo(() => {
    if (currentCommand) {
      return currentCommand.inputPlaceholder || tCmd(`commands.${currentCommand.name}.description`)
    }
    const agentName = currentAgent?.name || ''
    if (warmupPhase === 'preparing' || connectionStatus === 'connecting') {
      return t('status.typeWhileConnecting')
    }
    if (connectionStatus === 'disconnected' && agentName) {
      return t('status.ready', { name: agentName })
    }
    const modelName = models.find((model) => model.id === selectedModel)?.name
    if (agentName && modelName) {
      return t('input.placeholderWithModel', { agent: agentName, model: modelName })
    }
    if (agentName) {
      return t('input.placeholderWithAgent', { agent: agentName })
    }
    return t('input.placeholder')
  }, [currentCommand, currentAgent, models, selectedModel, connectionStatus, warmupPhase, t, tCmd])
  
  return (
    <div className="agent-panel" data-testid="agent-panel" style={{ position: 'relative' }}>
      {showEmptyAgentPanel && (
        <div className="agent-panel__toolbar agent-panel__toolbar--slim agent-panel__toolbar--empty">
          <span className="agent-panel__empty-label">{t('empty.panelLabel')}</span>
          <span className="agent-panel__empty-badge">{t('status.noAgents')}</span>
        </div>
      )}

      {detectedAgents.length > 0 && (
        <AgentToolbar
          agents={detectedAgents}
          currentBackend={currentBackend}
          agentStatus={agentStatus}
          warmupPhase={warmupPhase}
          onSelectAgent={selectAgent}
        />
      )}

      {chatDbUnavailable && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 12px',
            margin: '0 12px 8px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            fontSize: 12,
            color: theme.textSecondary,
          }}
        >
          {t('status.chatDbUnavailable')}
        </div>
      )}

      {detectedAgents.length > 0 && failureHint && (
        <div style={{
          flexShrink: 0,
          padding: '8px 12px',
          margin: '0 12px',
          borderRadius: 8,
          background: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ flex: 1, color: theme.textSecondary }}>
            {failureHint.action === 'reconnect'
              ? t('status.reconnectHint')
              : formatAlternateAgentHint(failureHint.backend)}
          </span>
          {failureHint.action === 'reconnect' && (
            <button
              type="button"
              onClick={handleManualReconnect}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: theme.primary,
                color: theme.primaryText || '#fff',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {t('actions.reconnect')}
            </button>
          )}
          {failureHint.action === 'switch_agent' && suggestAlternateAgents(failureHint.backend).map((agent) => (
            <button
              key={agent.backend}
              type="button"
              data-testid={`switch-agent-${agent.backend}`}
              onClick={() => {
                setFailureHint(null)
                void selectAgent(agent.backend)
              }}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                color: theme.text,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {agent.name}
            </button>
          ))}
        </div>
      )}

      <div className="agent-panel__body">
      {showAgentScanPlaceholder ? (
        <div
          data-testid="message-list"
          className="agent-panel__messages agent-panel__messages--enter"
          style={{ height: '100%' }}
        >
          <AgentConnectingSkeleton labelKey="status.detecting" />
        </div>
      ) : showEmptyAgentPanel ? (
        <div
          data-testid="message-list"
          className="agent-panel__messages agent-panel__messages--enter"
          style={{ height: '100%' }}
        >
          <AgentCliInstallGuide
            onInstall={() => setCliInstallOpen(true)}
            onRescan={() => void handleRescanAgents()}
            rescanning={rescanningAgents}
          />
        </div>
      ) : (
        <VirtualAgentMessageList
          ref={messageListRef}
          listKey={`${currentBackend || 'none'}-${messagesPaneEpoch}`}
          messages={currentMessages}
          theme={theme}
          isDark={isDark}
          workspacePath={state.workspacePath || undefined}
          renderMarkdown={renderMarkdown}
          onOpenFile={handleOpenToolFile}
          onUserScrollChange={setUserScrolled}
          footer={showThinkingPlaceholder ? <AgentThinkingPlaceholder agentName={currentAgent?.name} /> : undefined}
          header={(
            <>
              {historyLoading && currentMessages.length === 0 && (
                <div className="agent-panel__history-hint" style={{ fontSize: 12, color: theme.textSecondary, padding: '8px 0', textAlign: 'center' }}>
                  {t('status.loadingHistory', { name: currentAgent?.name || '' })}
                </div>
              )}
              {showVaultContext && (
                <AgentVaultContext
                  workspacePath={state.workspacePath}
                  currentFile={state.currentFile}
                  agentName={currentAgent?.name}
                />
              )}
              {showLoadEarlier && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
                  <button
                    type="button"
                    className="agent-panel__load-earlier"
                    disabled={loadingEarlier}
                    onClick={() => void loadEarlierMessages()}
                  >
                    {loadingEarlier
                      ? t('status.loadingEarlier')
                      : historyTotal != null && historyTotal > loadedMessageCount
                        ? t('status.loadEarlierWithCount', {
                          loaded: loadedMessageCount,
                          total: historyTotal,
                        })
                        : t('status.loadEarlier')}
                  </button>
                </div>
              )}
            </>
          )}
        />
      )}

      {detectedAgents.length > 0 && (
        <footer className="agent-panel__footer">
          <AgentSlashBar
            slashCommands={slashCommands}
            currentCommand={currentCommand}
            onCommandClick={handleCommandClick}
            onClearCommand={() => setCurrentCommand(null)}
            connected={connectionStatus === 'connected'}
            tCmd={tCmd}
          />
          {(warmupPhase === 'preparing' || connectionStatus === 'connecting') && (
            <div className="agent-panel__input-hint">{t('status.typeWhileConnecting')}</div>
          )}
          <div className="agent-panel__footer-status-row">
            <AgentInputControls
              connectionStatus={connectionStatus}
              isStreaming={state.acp.isStreaming}
              hasInProgressTools={hasInProgressTools}
              warmupPhase={warmupPhase}
              models={models}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              onStop={handleStopStreaming}
            />
            {connectionStatus === 'connected' && modeOptions.length > 0 && (
              <AgentModePill
                selectedMode={selectedMode}
                modeOptions={modeOptions}
                onModeChange={handleModeChange}
                disabled={isAgentBusy}
              />
            )}
          </div>
          <AgentChatInput
            onSend={sendMessage}
            disabled={isAgentBusy}
            placeholder={inputPlaceholder}
            workspacePath={state.workspacePath}
            currentFilePath={state.currentFile}
            currentCommandBorder={currentCommand ? theme.primary : undefined}
            canSubmitEmpty={currentCommand?.inputMode === 'optional'}
          />
        </footer>
      )}

      {pendingAuth && pendingAuth.backend === currentBackend && (
        <div
          data-testid="acp-auth-modal"
          style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          pointerEvents: 'none',
        }}>
          <div style={{
            background: theme.bgSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 20,
            maxWidth: 420,
            width: '90%',
            pointerEvents: 'auto',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('auth.title')}</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
              {t('auth.description', { backend: pendingAuth.backend })}
              {authInProgress && !pendingAuth.error && (
                <div style={{ marginTop: 8, color: theme.primary }}>{t('auth.inProgress')}</div>
              )}
              {pendingAuth.backend === 'gemini' && (
                <div style={{ marginTop: 10, fontSize: 12, color: theme.textSecondary }}>
                  {t('auth.terminalLoginHint')}
                </div>
              )}
              {pendingAuth.error && (
                <div style={{ marginTop: 8, color: theme.error }}>{pendingAuth.error}</div>
              )}
              {pendingAuth.error && /no longer supported|antigravity/i.test(pendingAuth.error) && (
                <div style={{ marginTop: 8, color: theme.warning || '#fbbf24', fontSize: 12 }}>
                  {t('auth.deprecatedGoogleLogin')}
                </div>
              )}
              {pendingAuthUrl && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 6 }}>{t('auth.browserHint')}</div>
                  <a
                    href={pendingAuthUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: theme.primary, wordBreak: 'break-all', fontSize: 12 }}
                    onClick={(e) => {
                      e.preventDefault()
                      window.electronAPI?.openExternal?.(pendingAuthUrl)
                    }}
                  >
                    {t('auth.openBrowser')}
                  </a>
                </div>
              )}
            </div>
            {showApiKeyInput && (
              <div style={{ marginBottom: 12 }}>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={t('auth.apiKeyPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.bg,
                    color: theme.text,
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                />
                <button
                  type="button"
                  disabled={authInProgress || !apiKeyInput.trim()}
                  onClick={() => void handleAuthenticate('gemini-api-key', apiKeyInput)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: theme.primary,
                    color: theme.primaryText || '#fff',
                    cursor: authInProgress || !apiKeyInput.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    opacity: authInProgress || !apiKeyInput.trim() ? 0.6 : 1,
                  }}
                >
                  {t('auth.apiKeySubmit')}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pendingAuth.backend === 'gemini' && (
                <button
                  type="button"
                  disabled={authInProgress}
                  onClick={() => void handleGeminiTerminalLogin()}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${theme.primary}`,
                    background: 'transparent',
                    color: theme.primary,
                    cursor: authInProgress ? 'wait' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {t('auth.terminalLogin')}
                </button>
              )}
              {(pendingAuth.methods.length ? pendingAuth.methods : [{ id: 'default', name: t('auth.googleLogin') }]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={authInProgress}
                  onClick={() => handleAuthMethodClick(m.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.primary,
                    color: theme.primaryText || '#fff',
                    cursor: authInProgress ? 'wait' : 'pointer',
                    fontSize: 12,
                    opacity: authInProgress ? 0.7 : 1,
                  }}
                >
                  {authInProgress && m.id !== 'gemini-api-key' ? '…' : resolveAuthMethodLabel(m, t)}
                </button>
              ))}
              <button
                type="button"
                disabled={authInProgress}
                onClick={dismissAuthModal}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: 'transparent',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {t('permission.later')}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {pendingPermission && (
        <div
          data-testid="acp-permission-modal"
          style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: theme.bgSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 20,
            maxWidth: 420,
            width: '90%',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('permission.title')}</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
              {pendingPermission.toolCall?.title || t('permission.toolRequest')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pendingPermission.options.map((opt) => (
                <button
                  key={opt.optionId}
                  type="button"
                  data-testid={`acp-permission-option-${opt.optionId}`}
                  onClick={() => respondToPermissionChoice(opt.optionId)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.bg,
                    color: theme.text,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {opt.name || opt.optionId}
                </button>
              ))}
              <button
                type="button"
                onClick={dismissPermissionModal}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: 'transparent',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {t('permission.later')}
              </button>
            </div>
          </div>
        </div>
      )}

      {(pendingYoloMode || yoloFirstRunPrompt) && (
        <div
          data-testid="yolo-warning-modal"
          data-yolo-prompt={yoloFirstRunPrompt ? 'first-run' : 'switch'}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
        >
          <div style={{
            background: theme.bgSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 20,
            maxWidth: 440,
            width: '90%',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {t(yoloFirstRunPrompt ? 'yoloWarning.firstRunTitle' : 'yoloWarning.title')}
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
              {t(yoloFirstRunPrompt ? 'yoloWarning.firstRunBody' : 'yoloWarning.body')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                data-testid="yolo-warning-confirm"
                onClick={() => void confirmYoloMode()}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: theme.primary,
                  color: theme.primaryText || '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {t(yoloFirstRunPrompt ? 'yoloWarning.firstRunConfirm' : 'yoloWarning.confirm')}
              </button>
              <button
                type="button"
                data-testid="yolo-warning-cancel"
                onClick={cancelYoloMode}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: 'transparent',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {t(yoloFirstRunPrompt ? 'yoloWarning.firstRunCancel' : 'yoloWarning.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CliInstallPanel open={cliInstallOpen} onClose={handleCliInstallClose} />
    </div>
  )
}

export default AgentChatPanel
