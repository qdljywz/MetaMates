import { ipcMain, BrowserWindow, app, type IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { BackendConnection, LOGO_COLORS, clearAllConversationCaches, type AgentConfig } from './AcpConnection'
import * as sessionDb from './sessionDb'
import { sessionStore } from './sessionStore'
import { readAppSettings, writeAppSettings } from '../appSettings'
import { filterEnabledCliAgents, isCliAgentEnabled } from '../shared/cliAgentPreferences'
import { getMcpServersForSettings } from './mcpSessionConfig'
import {
  detectInstalledCliAgents,
  isCliCommandAvailable,
  runInstallCommand,
  runUninstallPackage,
  resolveOllamaBridgePath,
} from '../cliDetection'
import { acpDetector } from './AcpDetector'
import { getGeminiSpawnEnv, isGeminiAuthenticated, openGeminiInteractiveLogin, persistGeminiApiKey } from '../geminiAuth'
import { openClaudeInteractiveLogin } from '../claudeAuth'
import { resolveAgentRuntimeForRenderer, resolveAllAgentRuntimesForRenderer } from '../agentCliConfig'
import { normalizeSkillFilePaths } from '../shared/skillPaths'
import { resolveSkillPaths } from '../shared/skillLayouts'
import { detectWorkspaceLanguage } from '../workspaceLayout'
import { resolveToolFilePathFromUpdate } from '../shared/sessionUpdatePipeline'
import { sanitizeAcpToolUpdate, type ToolCallUpdatePayload } from '../shared/acpToolCallOutput'
import { shouldHideAgentRethinkLeak } from '../shared/emptyStateRethinkLeak'
import { toWorkspaceRelativePath } from '../shared/pathSafety'
import {
  ensureSkillsForDetectedBackend,
  ensureWorkspaceSkills,
  syncAllWorkspaceSkills,
} from '../workspaceSkills'
import { evaluateAgentReadiness } from './agentReadiness'
import { classifyAcpError } from './acpErrors'
import { invalidateCloudReachability } from './cloudReachability'
import { checkAgentHealth, classifySessionFailure } from './agentHealth'
import { setConnectionStatusWindow, pushConnectionStatus } from './connectionStatus'
import { DEFAULT_AGENT_MODE } from '../shared/agentMode'
import { resolveAgentLogoInfoFromDisk } from '../shared/agentLogosDisk'
import { resolveAgentAssetsDir } from '../shared/appPaths'
import { setCurrentWorkspacePath, getCurrentWorkspacePath } from '../shared/workspaceState'
import { vaultApiServer } from '../vaultApi/server'
import { ensureWindowsFirewallRule } from '../vaultApi/firewall'

let detectedAgents: AgentConfig[] = []
let currentBackendId: string | null = null
let currentWorkspacePath = process.cwd()
let mainWindow: BrowserWindow | null = null
/** Resolves when CLI detection finishes — select-backend / warmup must await this. */
let agentDetectionPromise: Promise<AgentConfig[]> = Promise.resolve([])
const connectionPool = new Map<string, BackendConnection>()
const warmupInFlight = new Map<string, Promise<void>>()
let warmupGeneration = 0
let warmupAllScheduled = false
let startupWarmupStarted = false

const WARMUP_TIMEOUT_MS = 90_000

/** Claude session/new fails if vault MCP is injected while Vault API is still down. */
async function ensureVaultApiForAgentSession(): Promise<void> {
  const settings = readAppSettings()
  if (!settings.vaultApiEnabled) return
  const workspace = getCurrentWorkspacePath()?.trim()
  if (!workspace) return
  if (vaultApiServer.getStatus().running) return

  const port = Number(settings.vaultApiPort) || 17333
  const bindLan = !!settings.vaultApiLanAccess
  const calendarIcsPath = typeof settings.calendarIcsPath === 'string' ? settings.calendarIcsPath : undefined

  if (bindLan) {
    const fw = await ensureWindowsFirewallRule(port)
    if (!fw.ok && !fw.skipped) {
      console.warn('[ACP] Vault API firewall rule not added:', fw.error)
    }
  }

  const result = await vaultApiServer.start(workspace, port, { calendarIcsPath, bindLan })
  if (!result.success) {
    console.warn('[ACP] Vault API start before agent session failed:', result.error)
  } else {
    console.log('[ACP] Vault API ready for agent MCP on port', result.port)
  }
}

const pendingBackendReady = new Map<string, Array<{
  success: boolean
  sessionId?: string
  mode?: string
  error?: string
  quotaExceeded?: boolean
  authRequired?: boolean
  authMethods?: Array<{ id: string; name?: string }>
}>>()

function extractHistoryTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    const record = content as { content?: unknown; text?: unknown; display?: unknown }
    if (typeof record.display === 'string') return record.display
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content
    if (record.content && typeof record.content === 'object') {
      const nested = record.content as { content?: unknown; text?: unknown }
      if (typeof nested.text === 'string') return nested.text
      if (typeof nested.content === 'string') return nested.content
    }
  }
  return ''
}

function isHiddenHistoryMessage(msg: sessionDb.Message): boolean {
  if (msg.position === 'right') {
    const display = extractHistoryTextContent(msg.content)
    if (/^\[\s*background-empty-state\s*\]/i.test(display.trim())) return true
    return false
  }
  if (msg.type === 'text' || msg.position === 'left') {
    const text = extractHistoryTextContent(msg.content)
    return shouldHideAgentRethinkLeak(text)
  }
  return false
}

/** Backfill toolFilePath on stored tool cards so "Open file" works for older history. */
function enrichHistoryMessages(
  messages: sessionDb.Message[],
  workspacePath: string,
): sessionDb.Message[] {
  const visible = messages.filter((msg) => !isHiddenHistoryMessage(msg))
  if (!workspacePath?.trim()) return visible
  return visible.map((msg) => {
    if (msg.type !== 'acp_tool_call') return msg
    const content = msg.content as { update?: Record<string, unknown> } | undefined
    const update = content?.update
    if (!update || typeof update !== 'object') return msg
    if (typeof update.toolFilePath === 'string' && update.toolFilePath.trim()) return msg

    const resolved = resolveToolFilePathFromUpdate(
      sanitizeAcpToolUpdate(update as ToolCallUpdatePayload),
    )
    if (!resolved?.trim()) return msg

    const relative = toWorkspaceRelativePath(workspacePath, resolved.trim())
    if (!relative) return msg

    return {
      ...msg,
      content: {
        ...content,
        update: {
          ...update,
          toolFilePath: relative,
        },
      },
    }
  })
}

/** Silently spawn CLI + session in background; notify renderer when done. */
function emitBackendReady(
  backendId: string,
  payload: {
    success: boolean
    sessionId?: string
    mode?: string
    error?: string
    quotaExceeded?: boolean
    authRequired?: boolean
    authMethods?: Array<{ id: string; name?: string }>
  },
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('acp-backend-ready', { backend: backendId, ...payload })
    return
  }
  const queue = pendingBackendReady.get(backendId) || []
  queue.push(payload)
  pendingBackendReady.set(backendId, queue)
  console.log(`[WARMUP] Buffered acp-backend-ready for ${backendId} (window not ready)`)
}

export function flushPendingBackendReady(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  for (const [backendId, payloads] of pendingBackendReady.entries()) {
    for (const payload of payloads) {
      mainWindow.webContents.send('acp-backend-ready', { backend: backendId, ...payload })
    }
  }
  if (pendingBackendReady.size > 0) {
    console.log(`[WARMUP] Flushed ${pendingBackendReady.size} buffered backend-ready event(s)`)
  }
  pendingBackendReady.clear()
}

export function setAcpMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
  setConnectionStatusWindow(win)
  if (win && !win.isDestroyed()) {
    flushPendingBackendReady()
  }
}

export async function startAcpStartupWarmup(): Promise<void> {
  if (startupWarmupStarted) return
  startupWarmupStarted = true
  await warmupStartupAgents()
}

async function runBackendWarmup(backendId: string, generation: number): Promise<void> {
  const result = await ensureBackendSession(backendId)
  if (generation !== warmupGeneration) return
  emitBackendReady(backendId, result)
  const conn = connectionPool.get(backendId)
  void pushConnectionStatus(backendId, conn)
  if (result.success && result.sessionId) {
    console.log(`[WARMUP] ${backendId} session ready`)
  } else if (result.error) {
    console.log(`[WARMUP] ${backendId}:`, result.error)
  }
}

function cancelWarmupGeneration(): void {
  warmupGeneration += 1
  warmupInFlight.clear()
}

function startBackendWarmup(backendId: string, options?: { force?: boolean }): void {
  const generation = warmupGeneration
  const conn = getConnection(backendId)
  if (conn?.child && conn.sessionId) {
    void evaluateAgentReadiness(backendId, conn).then((readiness) => {
      if (generation !== warmupGeneration) return
      emitBackendReady(backendId, {
        success: readiness.ready,
        sessionId: conn.sessionId || undefined,
        mode: conn.getMode(),
        error: readiness.ready ? undefined : readiness.error,
        authRequired: readiness.needsAuth,
        authMethods: readiness.needsAuth ? conn.getAuthMethods() : undefined,
      })
      void pushConnectionStatus(backendId, conn)
    })
    return
  }

  if (warmupInFlight.has(backendId)) {
    if (!options?.force) return
    console.log(`[WARMUP] Force-restarting stuck warmup for ${backendId}`)
    conn?.disconnect()
    connectionPool.delete(backendId)
    warmupInFlight.delete(backendId)
  }

  const promise = Promise.race([
    runBackendWarmup(backendId, generation),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error(`Warmup timed out after ${WARMUP_TIMEOUT_MS / 1000}s`)), WARMUP_TIMEOUT_MS)
    }),
  ])
    .catch((error: unknown) => {
      if (generation !== warmupGeneration) return
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[WARMUP] ${backendId} failed:`, message)
      const stuck = connectionPool.get(backendId)
      if (stuck?.child && !stuck.sessionId) {
        stuck.disconnect()
        connectionPool.delete(backendId)
      }
      emitBackendReady(backendId, { success: false, error: message })
    })
    .finally(() => {
      if (generation !== warmupGeneration) return
      warmupInFlight.delete(backendId)
    })
  warmupInFlight.set(backendId, promise)
}

function getEnabledDetectedAgents(): AgentConfig[] {
  return filterEnabledCliAgents(detectedAgents, readAppSettings())
}

function disconnectBackend(backendId: string): void {
  const conn = connectionPool.get(backendId)
  if (conn) {
    conn.disconnect()
    connectionPool.delete(backendId)
  }
  if (currentBackendId === backendId) {
    currentBackendId = null
  }
}

/** Disconnect every ACP backend and cancel in-flight warmup (app shutdown). */
export function disconnectAllAcpBackends(): void {
  cancelWarmupGeneration()
  for (const [backendId, conn] of connectionPool.entries()) {
    conn.disconnect()
    connectionPool.delete(backendId)
  }
  warmupInFlight.clear()
  currentBackendId = null
}

function notifyCliAgentsChanged(agents: AgentConfig[]): void {
  const win =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (win) {
    win.webContents.send('cli-agents-changed', { agents })
  }
}

/** Apply CLI Agent panel visibility after settings.cliAgentEnabled changes. */
export function syncCliAgentEnabledPreferences(
  nextMap: Record<string, boolean>,
  previousMap?: Record<string, boolean>,
): AgentConfig[] {
  if (detectedAgents.length === 0) {
    console.log('[ACP] CLI preferences saved; installed agents not ready yet')
    return []
  }
  for (const [backendId, enabled] of Object.entries(nextMap)) {
    if (enabled === false && previousMap?.[backendId] !== false) {
      disconnectBackend(backendId)
    }
  }
  const agents = getEnabledDetectedAgents()
  notifyCliAgentsChanged(agents)
  return agents
}

function scheduleWarmupPreferredAgent(options?: { force?: boolean }): void {
  const settings = readAppSettings()
  const enabled = getEnabledDetectedAgents()
  if (enabled.length === 0) return

  const preferred =
    (currentBackendId && enabled.some((a) => a.backend === currentBackendId)
      ? currentBackendId
      : null) ||
    (typeof settings.lastAgentBackend === 'string' &&
    enabled.some((a) => a.backend === settings.lastAgentBackend)
      ? settings.lastAgentBackend
      : enabled[0].backend)

  currentBackendId = preferred
  startBackendWarmup(preferred, options)
}

function scheduleWarmupAllAgents(options?: { priorityBackend?: string | null; force?: boolean }): void {
  const enabled = getEnabledDetectedAgents()
  if (enabled.length === 0) return
  if (warmupAllScheduled && !options?.force) return

  const priority = options?.priorityBackend
  const ordered = [...enabled]
  if (priority) {
    const idx = ordered.findIndex((a) => a.backend === priority)
    if (idx > 0) {
      const [preferred] = ordered.splice(idx, 1)
      ordered.unshift(preferred)
    }
  }

  warmupAllScheduled = true
  console.log(
    `[WARMUP] Scheduling warmup for ${ordered.length} agent(s), first: ${ordered[0]?.backend}`,
  )

  ordered.forEach((agent, index) => {
    const delay = index === 0 ? 0 : index * 400
    setTimeout(() => startBackendWarmup(agent.backend), delay)
  })
}

async function waitForBackendWarmup(backendId: string, timeoutMs: number): Promise<boolean> {
  startBackendWarmup(backendId)
  const inflight = warmupInFlight.get(backendId)
  if (!inflight) {
    const conn = connectionPool.get(backendId)
    return !!(conn?.child && conn.sessionId)
  }

  let settled = false
  await Promise.race([
    inflight.then(() => {
      settled = true
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])

  const conn = connectionPool.get(backendId)
  const ready = !!(conn?.child && conn.sessionId)
  if (ready) {
    console.log(`[WARMUP] ${backendId} ready (${settled ? 'before timeout' : 'after partial wait'})`)
  } else if (!settled) {
    console.log(`[WARMUP] ${backendId} still warming after ${timeoutMs}ms — opening UI anyway`)
  }
  return ready
}

/** Pre-spawn last-used CLI before the window opens (AionUi-style). */
async function warmupStartupAgents(): Promise<void> {
  await agentDetectionPromise
  const settings = readAppSettings()
  const enabled = getEnabledDetectedAgents()
  if (enabled.length === 0) return

  const preferred =
    typeof settings.lastAgentBackend === 'string' &&
    enabled.some((a) => a.backend === settings.lastAgentBackend)
      ? settings.lastAgentBackend
      : enabled[0].backend

  currentBackendId = preferred
  console.log(`[WARMUP] Startup priority agent: ${preferred}`)

  await waitForBackendWarmup(preferred, 20_000)
  // Other agents connect lazily when the user switches — avoids N× MCP bridge orphans.
}

/** @deprecated alias */
function warmupBackendSilently(backendId: string): void {
  startBackendWarmup(backendId)
}

/** Wait for spawn + session — single connection path for warmup, switch, and send-prompt. */
async function ensureBackendSession(
  backendId: string,
  options?: { resume?: boolean },
): Promise<{
  success: boolean
  sessionId?: string
  mode?: string
  error?: string
  quotaExceeded?: boolean
  authRequired?: boolean
  authMethods?: Array<{ id: string; name?: string }>
}> {
  const inflight = warmupInFlight.get(backendId)
  if (inflight) await inflight

  const conn = getConnection(backendId)
  if (!conn) return { success: false, error: `Unknown backend: ${backendId}` }

  await ensureVaultApiForAgentSession()

  if (conn.child && conn.sessionId) {
    const readiness = await evaluateAgentReadiness(backendId, conn)
    if (!readiness.ready) {
      return {
        ...enrichEnsureSessionFailure(backendId, readiness.error || 'Agent not ready', readiness.needsAuth),
        authMethods: readiness.needsAuth ? conn.getAuthMethods() : undefined,
      }
    }
    return { success: true, sessionId: conn.sessionId, mode: conn.getMode() }
  }

  try {
    if (!conn.child) {
      const connectResult = await conn.connect()
      if (!connectResult.success) {
        const failure = enrichEnsureSessionFailure(
          backendId,
          connectResult.error || 'Connection failed',
        )
        return {
          ...failure,
          authMethods: failure.authRequired ? conn.getAuthMethods() : undefined,
        }
      }
    }
    if (!conn.sessionId) {
      await conn.createSession(options?.resume !== false)
    }
  } catch (error: any) {
    const classified = classifySessionFailure(
      backendId,
      error.message || 'Session failed',
      !!error.authRequired,
    )
    const billing = classifyAcpError(error)
    return {
      success: false,
      error: classified.error,
      quotaExceeded: billing.quotaExceeded || !!error.quotaExceeded,
      authRequired: classified.authRequired && !billing.quotaExceeded,
      authMethods: classified.authRequired
        ? error.authMethods || conn.getAuthMethods()
        : undefined,
    }
  }

  if (conn.sessionId) {
    const readiness = await evaluateAgentReadiness(backendId, conn)
    if (!readiness.ready) {
      void pushConnectionStatus(backendId, conn)
      return {
        ...enrichEnsureSessionFailure(
          backendId,
          readiness.error || 'Agent not ready for prompts',
          readiness.needsAuth,
        ),
        authMethods: readiness.needsAuth ? conn.getAuthMethods() : undefined,
      }
    }
    void pushConnectionStatus(backendId, conn)
    return { success: true, sessionId: conn.sessionId, mode: conn.getMode() }
  }

  return { success: false, error: 'Session not ready' }
}

function enrichEnsureSessionFailure(
  backendId: string,
  errorMessage: string,
  authRequiredFlag = false,
): {
  success: false
  error: string
  quotaExceeded?: boolean
  authRequired?: boolean
} {
  const classified = classifySessionFailure(backendId, errorMessage, authRequiredFlag)
  const billing = classifyAcpError(new Error(errorMessage))
  return {
    success: false,
    error: classified.error,
    quotaExceeded: billing.quotaExceeded,
    authRequired: classified.authRequired && !billing.quotaExceeded,
  }
}

function assignMainWindowFromEvent(event: IpcMainInvokeEvent, backendId: string): BackendConnection {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    mainWindow = win
  }
  const conn = getConnection(backendId)
  if (!conn) throw new Error(`Unknown backend: ${backendId}`)
  if (mainWindow) {
    conn.setMainWindow(mainWindow)
  }
  return conn
}

function getLogoInfo(backendId: string, name: string): { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string } {
  return resolveAgentLogoInfoFromDisk(backendId, resolveAgentAssetsDir(), { name })
}

const GEMINI_AUTH_METHODS = [
  { id: 'google-oauth', name: 'Log in with Google' },
  { id: 'gemini-api-key', name: 'Gemini API key' },
]

function geminiAuthBlocked(): { success: false; authRequired: true; authMethods: typeof GEMINI_AUTH_METHODS } {
  return { success: false, authRequired: true, authMethods: GEMINI_AUTH_METHODS }
}

async function detectInstalledClis(force = false): Promise<AgentConfig[]> {
  const detected: AgentConfig[] = (await detectInstalledCliAgents(undefined, force)).map((cli) => ({
    backend: cli.backend,
    name: cli.name,
    cliPath: cli.cliPath,
    acpArgs: cli.acpArgs,
    logo: getLogoInfo(cli.backend, cli.name),
  }))

  const ollamaAgent = detectOllamaAgent()
  if (ollamaAgent) {
    detected.push(ollamaAgent)
    console.log('[DETECT] Found: Ollama (Local)')
  }

  if (currentWorkspacePath && fs.existsSync(currentWorkspacePath)) {
    const language = detectWorkspaceLanguage(currentWorkspacePath)
    for (const agent of detected) {
      const result = ensureSkillsForDetectedBackend(currentWorkspacePath, language, agent.backend)
      if (result.created.length > 0) {
        console.log(`[SKILLS] Auto-provisioned for ${agent.backend}:`, result.created.join(', '))
      }
    }
  }

  return detected
}

function detectOllamaAgent(): AgentConfig | null {
  const settings = readAppSettings()
  if (!settings.ollamaEnabled) return null

  const bridgePath = resolveOllamaBridgePath()
  if (!bridgePath) {
    console.log('[DETECT] Ollama bridge script not found:', bridgePath)
    return null
  }

  const baseUrl = (settings.ollamaBaseUrl as string) || 'http://127.0.0.1:11434'
  const model = (settings.ollamaModel as string) || 'llama3.2'
  const logoInfo = getLogoInfo('ollama', 'Ollama (Local)')

  return {
    backend: 'ollama',
    name: 'Ollama (Local)',
    cliPath: 'node',
    acpArgs: [bridgePath],
    spawnEnv: {
      OLLAMA_BASE_URL: baseUrl,
      OLLAMA_MODEL: model,
    },
    logo: logoInfo,
  }
}

function getConnection(backendId: string): BackendConnection | null {
  const config = detectedAgents.find(a => a.backend === backendId)
  if (!config) return null
  if (!connectionPool.has(backendId)) {
    const conn = new BackendConnection(config, () => currentWorkspacePath)
    connectionPool.set(backendId, conn)
  } else {
    connectionPool.get(backendId)!.updateSpawnConfig(config)
  }
  const conn = connectionPool.get(backendId)
  if (conn && mainWindow) {
    conn.setMainWindow(mainWindow)
  }
  return conn || null
}

function getCurrentConnection(): BackendConnection | null {
  if (!currentBackendId) return null
  return getConnection(currentBackendId)
}

export async function registerAcpIpcHandlers(): Promise<void> {
  const settings = readAppSettings()
  const envWorkspace = process.env.METAMATES_WORKSPACE?.trim()
  if (envWorkspace) {
    currentWorkspacePath = path.resolve(envWorkspace)
    setCurrentWorkspacePath(currentWorkspacePath)
    console.log('[ACP] METAMATES_WORKSPACE override:', currentWorkspacePath)
  } else if (typeof settings.workspacePath === 'string' && settings.workspacePath.trim()) {
    currentWorkspacePath = path.resolve(settings.workspacePath)
    setCurrentWorkspacePath(currentWorkspacePath)
    console.log('[ACP] Restored workspace for agent spawn:', currentWorkspacePath)
  }

  setCurrentWorkspacePath(currentWorkspacePath)

  const agentDetectionDelayMs = process.env.METAMATES_E2E === '1' ? 400 : 2_500
  agentDetectionPromise = new Promise<AgentConfig[]>((resolve) => {
    setTimeout(() => {
      void detectInstalledClis(true).then((agents) => {
        detectedAgents = agents
        console.log(`[DETECT] Found ${detectedAgents.length} installed CLIs`)
        resolve(agents)
      })
    }, agentDetectionDelayMs)
  })

  ipcMain.handle('get-detected-agents', async () => {
    if (process.env.METAMATES_E2E_NO_AGENTS === '1') return []
    await agentDetectionPromise
    return getEnabledDetectedAgents()
  })

  ipcMain.handle('get-all-installed-agents', async () => {
    await agentDetectionPromise
    return detectedAgents
  })

  ipcMain.handle('set-cli-agent-enabled', async (_event, backendId: string, enabled: boolean) => {
    try {
      const settings = readAppSettings()
      const previousMap = settings.cliAgentEnabled as Record<string, boolean> | undefined
      const cliAgentEnabled = {
        ...(previousMap || {}),
        [backendId]: enabled,
      }
      writeAppSettings({ cliAgentEnabled })
      const agents = syncCliAgentEnabledPreferences(cliAgentEnabled, previousMap)
      return { success: true, agents }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[ACP] set-cli-agent-enabled failed:', message)
      return { success: false, error: message, agents: getEnabledDetectedAgents() }
    }
  })

  ipcMain.handle('check-cli-available', (_event, cliName: string) => {
    return { available: isCliCommandAvailable(cliName) }
  })

  ipcMain.handle('install-cli', (_event, installCommand: string) => {
    return runInstallCommand(installCommand)
  })

  ipcMain.handle('uninstall-cli', (_event, npmPackage: string) => {
    return runUninstallPackage(npmPackage)
  })

  ipcMain.handle('get-current-backend', () => {
    return currentBackendId
  })

  ipcMain.handle('set-workspace-path', async (_event, workspacePath: string) => {
    const normalized = path.resolve(workspacePath)
    const current = getCurrentWorkspacePath() ? path.resolve(getCurrentWorkspacePath()) : ''
    if (current && normalized === current) {
      console.log('[MAIN] set-workspace-path: unchanged, skipping reconnect')
      return { success: true, unchanged: true }
    }

    console.log('[MAIN] set-workspace-path:', workspacePath)

    cancelWarmupGeneration()
    clearAllConversationCaches()

    for (const [backendId, conn] of connectionPool.entries()) {
      conn.disconnect()
      connectionPool.delete(backendId)
      await sessionStore.clearSession(backendId)
    }
    currentBackendId = null

    currentWorkspacePath = normalized
    setCurrentWorkspacePath(normalized)
    const language = detectWorkspaceLanguage(workspacePath)
    if (detectedAgents.length === 0) {
      detectedAgents = await detectInstalledClis(true)
    }
    const backendIds = detectedAgents.map((a) => a.backend)
    const skills = syncAllWorkspaceSkills(workspacePath, language, backendIds)
    if (skills.created.length > 0) {
      console.log('[SKILLS] Provisioned on workspace open:', skills.created.join(', '))
    }
    scheduleWarmupPreferredAgent({ force: true })
    return { success: true, skillsCreated: skills.created }
  })

  ipcMain.handle('warmup-all-agents', () => {
    const enabled = getEnabledDetectedAgents()
    for (const agent of enabled) {
      startBackendWarmup(agent.backend)
    }
    return { success: true, count: enabled.length }
  })

  ipcMain.handle('acp-check-agent-health', (_event, backendId: string) => {
    return checkAgentHealth(backendId)
  })

  ipcMain.handle(
    'acp-ensure-session',
    async (event, backendId: string, options?: { freshSession?: boolean }) => {
      console.log('[MAIN] acp-ensure-session:', backendId, options)
      if (!isCliAgentEnabled(backendId, readAppSettings())) {
        return { success: false, error: 'Agent is disabled in settings' }
      }
      assignMainWindowFromEvent(event, backendId)
      currentBackendId = backendId
      if (options?.freshSession) {
        await sessionStore.clearSession(backendId, getCurrentWorkspacePath())
        disconnectBackend(backendId)
      }
      return ensureBackendSession(backendId, { resume: !options?.freshSession })
    },
  )

  ipcMain.handle('connect', async (event, backendId: string) => {
    console.log('[MAIN] connect → ensure-session:', backendId)
    if (!currentBackendId) {
      currentBackendId = backendId
    }
    assignMainWindowFromEvent(event, backendId)
    const result = await ensureBackendSession(backendId)
    return {
      success: result.success,
      error: result.error,
      authRequired: result.authRequired,
      quotaExceeded: result.quotaExceeded,
      authMethods: result.authMethods,
      sessionId: result.sessionId,
      cached: result.success && !!result.sessionId,
    }
  })

  ipcMain.handle('new-session', async (event, backendId?: string, resume = true) => {
    const targetId = backendId || currentBackendId
    console.log('[MAIN] new-session → ensure-session:', targetId, 'resume:', resume)
    if (!targetId) throw new Error('No backend selected')
    assignMainWindowFromEvent(event, targetId)
    currentBackendId = targetId
    if (resume === false) {
      await sessionStore.clearSession(targetId, getCurrentWorkspacePath())
      disconnectBackend(targetId)
    }
    return ensureBackendSession(targetId, { resume })
  })

  ipcMain.handle('send-prompt', async (event, text: string, presetContext?: string, attachments?: Array<{ path: string; name: string }>, displayContent?: string) => {
    console.log('[MAIN] send-prompt:', text.substring(0, 50))
    const backendId = currentBackendId
    if (!backendId) return { success: false, error: 'No backend selected' }
    assignMainWindowFromEvent(event, backendId)

    let conn = getCurrentConnection()
    if (!conn?.sessionId) {
      console.log('[MAIN] No session, ensuring via ensureBackendSession...')
      const ensured = await ensureBackendSession(backendId)
      if (!ensured.success) {
        return {
          success: false,
          error: ensured.error,
          quotaExceeded: !!ensured.quotaExceeded,
          authRequired: !!ensured.authRequired,
          authMethods: ensured.authMethods,
        }
      }
      conn = getCurrentConnection()
    }
    if (!conn?.sessionId) {
      return { success: false, error: 'No session' }
    }

    const readiness = await evaluateAgentReadiness(backendId, conn)
    if (!readiness.ready) {
      return {
        success: false,
        error: readiness.error || 'Agent not ready for prompts',
        authRequired: readiness.needsAuth,
        authMethods: readiness.needsAuth ? conn.getAuthMethods() : undefined,
      }
    }

    try {
      return await conn.sendPrompt(text, presetContext || null, attachments || [], displayContent)
    } catch (error: any) {
      const classified = classifyAcpError(error)
      if (classified.networkError) {
        invalidateCloudReachability(backendId)
      }
      return {
        success: false,
        error: error.message,
        quotaExceeded: classified.quotaExceeded || !!error.quotaExceeded,
        authRequired: classified.authRequired || !!error.authRequired,
      }
    }
  })

  ipcMain.handle('disconnect', async (_event, backendId?: string) => {
    console.log('[MAIN] disconnect:', backendId || 'current')
    const targetId = backendId || currentBackendId
    if (!targetId) return { success: true }
    
    const conn = connectionPool.get(targetId)
    if (conn) {
      conn.disconnect()
      connectionPool.delete(targetId)
    }
    if (currentBackendId === targetId) {
      currentBackendId = null
    }
    return { success: true }
  })

  ipcMain.handle('get-models', async () => {
    console.log('[MAIN] get-models')
    const conn = getCurrentConnection()
    if (!conn) throw new Error('No backend selected')
    return await conn.getModels()
  })

  ipcMain.handle('set-model', async (_event, modelId: string) => {
    console.log('[MAIN] set-model:', modelId)
    const conn = getCurrentConnection()
    if (!conn) throw new Error('No backend selected')
    return await conn.setModel(modelId)
  })

  ipcMain.handle('set-mode', async (_event, mode: string) => {
    console.log('[MAIN] set-mode:', mode)
    const conn = getCurrentConnection()
    if (!conn) throw new Error('No backend selected')
    return await conn.setMode(mode)
  })

  ipcMain.handle('get-mode', async () => {
    const conn = getCurrentConnection()
    if (!conn) return { mode: DEFAULT_AGENT_MODE }
    return { mode: conn.getMode() }
  })

  ipcMain.handle('get-session-info', async (_event, backendId?: string) => {
    const targetId = backendId || currentBackendId
    if (!targetId) return null
    return sessionStore.getSession(targetId, getCurrentWorkspacePath())
  })

  ipcMain.handle('clear-session', async (_event, backendId?: string) => {
    const targetId = backendId || currentBackendId
    if (!targetId) return { success: true }
    await sessionStore.clearSession(targetId, getCurrentWorkspacePath())
    return { success: true }
  })

  ipcMain.handle('get-conversation-history', (_event, backendId?: string, options?: { limit?: number; before?: number }) => {
    const targetId = backendId || currentBackendId
    if (!targetId) return { messages: [], total: 0, hasMore: false }

    const workspacePath = getCurrentWorkspacePath()
    const conversation = sessionDb.getConversationByBackend(targetId, workspacePath)
    if (!conversation) return { messages: [], total: 0, hasMore: false }

    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500)
    const total = sessionDb.getConversationMessageCount(conversation.id)

    let messages: sessionDb.Message[]
    let hasMore: boolean
    if (options?.before != null) {
      messages = sessionDb.getConversationMessagesBefore(conversation.id, options.before, limit)
      hasMore = sessionDb.countConversationMessagesBefore(conversation.id, messages[0]?.created_at ?? options.before) > 0
    } else {
      messages = sessionDb.getRecentConversationMessages(conversation.id, limit)
      hasMore = total > messages.length
    }

    console.log(`[MAIN] get-conversation-history: ${messages.length}/${total} messages for ${targetId} @ ${workspacePath || '(none)'}`)
    const enriched = enrichHistoryMessages(messages, workspacePath)
    return { messages: enriched, total, hasMore }
  })

  ipcMain.handle('clear-conversation-history', async (_event, backendId?: string) => {
    const targetId = backendId || currentBackendId
    if (!targetId) return { success: true }

    const workspacePath = getCurrentWorkspacePath()
    const conversation = sessionDb.getConversationByBackend(targetId, workspacePath)
    if (conversation) {
      sessionDb.deleteConversation(conversation.id)
    }
    clearAllConversationCaches()
    return { success: true }
  })

  ipcMain.handle('select-backend', async (event, backendId: string) => {
    console.log('[MAIN] select-backend (instant):', backendId)

    await agentDetectionPromise

    if (!isCliAgentEnabled(backendId, readAppSettings())) {
      return { success: false, error: 'Agent is disabled in settings' }
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      mainWindow = win
    }

    const conn = getConnection(backendId)
    if (!conn) throw new Error(`Unknown backend: ${backendId}`)

    if (mainWindow) {
      conn.setMainWindow(mainWindow)
    }

    currentBackendId = backendId

    if (conn.child && conn.sessionId) {
      return { success: true, sessionId: conn.sessionId, mode: conn.getMode() }
    }

    startBackendWarmup(backendId)
    return { success: true, pending: true }
  })

  ipcMain.handle('switch-backend', async (event, backendId: string) => {
    console.log('[MAIN] switch-backend → ensure-session:', backendId)

    if (!isCliAgentEnabled(backendId, readAppSettings())) {
      return { success: false, error: 'Agent is disabled in settings' }
    }

    assignMainWindowFromEvent(event, backendId)
    currentBackendId = backendId

    const result = await ensureBackendSession(backendId)
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        authRequired: !!result.authRequired,
        authMethods: result.authMethods,
      }
    }
    return {
      success: true,
      sessionId: result.sessionId,
      mode: result.mode || DEFAULT_AGENT_MODE,
    }
  })

  ipcMain.handle('get-connection-status', async (_event, backendId: string) => {
    const conn = connectionPool.get(backendId)
    return evaluateAgentReadiness(backendId, conn ?? undefined)
  })

  ipcMain.handle('get-all-connection-statuses', async () => {
    const statuses: Record<string, Awaited<ReturnType<typeof evaluateAgentReadiness>>> = {}
    for (const agent of getEnabledDetectedAgents()) {
      statuses[agent.backend] = await evaluateAgentReadiness(
        agent.backend,
        connectionPool.get(agent.backend),
      )
    }
    return statuses
  })

  ipcMain.handle('invalidate-cloud-reachability', (_event, backendId?: string) => {
    invalidateCloudReachability(backendId)
    return { success: true }
  })

  ipcMain.on('respond-to-permission', (_event, data: { backend: string; requestId: number; optionId: string }) => {
    console.log('[MAIN] respond-to-permission:', data)
    const conn = getConnection(data.backend)
    if (conn) {
      conn.respondToPermission(data.requestId, data.optionId)
    }
  })

  ipcMain.on('reject-permission', (_event, data: { backend: string; requestId: number }) => {
    console.log('[MAIN] reject-permission:', data)
    const conn = getConnection(data.backend)
    if (conn) {
      conn.rejectPermission(data.requestId)
    }
  })

  ipcMain.handle('get-available-commands', async (_event, backendId?: string) => {
    const targetId = backendId || currentBackendId
    if (!targetId) return []
    const conn = connectionPool.get(targetId)
    return conn?.getAvailableCommands() ?? []
  })

  ipcMain.handle('auto-test-message', async (_event, backend: string) => {
    console.log('[MAIN] auto-test-message for:', backend)
    const conn = getConnection(backend)
    if (!conn) {
      return { success: false, error: 'No connection' }
    }
    
    try {
      const testMsg = '请在当前目录创建一个test_permission.txt文件，内容是"Permission test successful"'
      console.log('[MAIN] Sending test message:', testMsg)
      const result = await conn.sendPrompt(testMsg, null)
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('read-skill-file', async (_event, skillName: string, backendId?: string) => {
    const targetBackend = backendId || currentBackendId
    if (!targetBackend) {
      return { success: false, error: 'No backend selected' }
    }
    if (!currentWorkspacePath) {
      return { success: false, error: 'No workspace set' }
    }

    const skillPaths = resolveSkillPaths(currentWorkspacePath, skillName, targetBackend)

    for (const skillPath of skillPaths) {
      try {
        if (fs.existsSync(skillPath)) {
          const raw = fs.readFileSync(skillPath, 'utf-8')
          const language = detectWorkspaceLanguage(currentWorkspacePath)
          const content = normalizeSkillFilePaths(raw, language)
          console.log(`[MAIN] read-skill-file: found ${skillPath}`)
          return { success: true, content, path: skillPath }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`[MAIN] read-skill-file: error reading ${skillPath}:`, message)
      }
    }

    console.log(`[MAIN] read-skill-file: not found for ${skillName} (backend=${targetBackend})`)
    return { success: false, error: `Skill file not found: ${skillName}` }
  })

  ipcMain.handle('ensure-workspace-skills', (_event, workspacePath?: string, language?: 'zh' | 'en') => {
    const root = workspacePath || currentWorkspacePath
    if (!root) return { success: false, error: 'No workspace set' }
    const lang = language || detectWorkspaceLanguage(root)
    const backendIds = detectedAgents.map((a) => a.backend)
    return ensureWorkspaceSkills(root, lang, backendIds)
  })

  ipcMain.handle('sync-workspace-skills', async (_event, workspacePath?: string, language?: 'zh' | 'en') => {
    const root = workspacePath || currentWorkspacePath
    if (!root) {
      return { success: false, created: [], skipped: [], error: 'No workspace set', backends: [] as string[] }
    }
    const lang = language || detectWorkspaceLanguage(root)
    detectedAgents = await detectInstalledClis(true)
    const backendIds = detectedAgents.map((a) => a.backend)
    const result = syncAllWorkspaceSkills(root, lang, backendIds)
    if (result.created.length > 0) {
      console.log('[SKILLS] Manual sync created:', result.created.join(', '))
    }
    return { ...result, backends: backendIds }
  })

  ipcMain.on('cancel-prompt', (_event, data?: { backend?: string }) => {
    const targetId = data?.backend || currentBackendId
    const conn = targetId ? connectionPool.get(targetId) : getCurrentConnection()
    if (conn) {
      conn.cancelPrompt()
      console.log('[MAIN] cancel-prompt:', targetId || 'current')
    }
  })

  ipcMain.handle('acp-authenticate', async (_event, backendId: string, methodId?: string, meta?: Record<string, unknown>) => {
    console.log('[MAIN] acp-authenticate:', backendId, methodId)
    if (backendId === 'gemini' && methodId === 'gemini-api-key') {
      const apiKey = meta?.['api-key']
      if (typeof apiKey === 'string' && apiKey.trim()) {
        persistGeminiApiKey(apiKey.trim())
      }
    }

    let conn = getConnection(backendId)
    if (!conn) throw new Error(`Unknown backend: ${backendId}`)

    if (backendId === 'gemini' && methodId === 'gemini-api-key') {
      conn.disconnect()
      connectionPool.delete(backendId)
      conn = getConnection(backendId)!
    }

    try {
      const result = await conn.authenticate(methodId, meta)
      const session = await conn.createSession()
      return { success: true, result, sessionId: session.sessionId, authMethods: conn.getAuthMethods() }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        quotaExceeded: !!error.quotaExceeded,
        authMethods: conn.getAuthMethods(),
      }
    }
  })

  ipcMain.handle('acp-check-gemini-auth', () => ({
    authenticated: isGeminiAuthenticated(),
  }))

  ipcMain.handle('acp-get-auth-methods', (_event, backendId: string) => {
    const conn = connectionPool.get(backendId)
    return conn?.getAuthMethods() || []
  })

  ipcMain.handle('acp-open-gemini-terminal-login', () => {
    console.log('[MAIN] acp-open-gemini-terminal-login')
    return openGeminiInteractiveLogin()
  })

  ipcMain.handle('acp-get-claude-preferred-model', () => {
    const runtime = resolveAgentRuntimeForRenderer('claude')
    return {
      modelId: runtime.display.effectiveModel,
      useEnvModel: !runtime.capabilities.canSwitchModel && !!runtime.display.effectiveModel,
    }
  })

  ipcMain.handle('acp-get-agent-runtime', (_event, backend: string) => {
    return resolveAgentRuntimeForRenderer(String(backend || ''))
  })

  ipcMain.handle('acp-get-all-agent-runtimes', () => {
    const backends = getEnabledDetectedAgents().map((a) => a.backend)
    return resolveAllAgentRuntimesForRenderer(backends)
  })

  ipcMain.handle('acp-open-claude-terminal-login', () => {
    console.log('[MAIN] acp-open-claude-terminal-login')
    return openClaudeInteractiveLogin()
  })

  ipcMain.handle('get-mcp-servers-config', () => {
    return getMcpServersForSettings()
  })

  ipcMain.handle('acp-reload-sessions', async () => {
    detectedAgents = await detectInstalledClis()
    const results: Array<{ backend: string; success: boolean; sessionId?: string; error?: string }> = []
    for (const [backendId, conn] of connectionPool) {
      if (!conn.child) continue
      try {
        const session = await conn.recreateSession(false)
        results.push({ backend: backendId, success: true, sessionId: session.sessionId })
      } catch (error: any) {
        results.push({ backend: backendId, success: false, error: error.message })
      }
    }
    return { results, agents: getEnabledDetectedAgents() }
  })

  ipcMain.handle('acp-refresh-agents', async () => {
    if (process.env.METAMATES_E2E_NO_AGENTS === '1') return []
    const previousBackends = new Set(getEnabledDetectedAgents().map((a) => a.backend))
    detectedAgents = await detectInstalledClis(true)
    const settings = readAppSettings()

    for (const [backendId, conn] of connectionPool.entries()) {
      if (!detectedAgents.some((a) => a.backend === backendId) || !isCliAgentEnabled(backendId, settings)) {
        conn.disconnect()
        connectionPool.delete(backendId)
      } else {
        conn.updateSpawnConfig(detectedAgents.find((a) => a.backend === backendId)!)
      }
    }

    const enabled = getEnabledDetectedAgents()
    for (const agent of enabled) {
      if (!previousBackends.has(agent.backend)) {
        startBackendWarmup(agent.backend)
      }
    }

    return enabled
  })

  void agentDetectionPromise.then(() => {
    console.log('[ACP] CLI detection finished for startup')
  })
  console.log('[ACP] IPC handlers registered')
}
