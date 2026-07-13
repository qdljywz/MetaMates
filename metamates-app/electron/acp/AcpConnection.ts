import { spawn, ChildProcess } from 'child_process'
import { killProcessTree, trackManagedProcess, untrackManagedProcess } from '../shared/processTreeKill'
import * as fsPromises from 'fs/promises'
import * as sessionDb from './sessionDb'
import { sessionStore } from './sessionStore'
import { buildMetaMatesMcpServers } from './mcpSessionConfig'
import { BrowserWindow, shell } from 'electron'
import { POTENTIAL_ACP_CLIS, LOGO_COLORS } from '../shared/acpRegistry'
import { createSpawnConfigFromResolved } from './acpSpawn'
import {
  applyClaudeChildEnvOverrides,
  buildClaudeSessionNewPayload,
  getClaudePreferredModelId,
  getClaudeSpawnEnv,
  readClaudeSettingsEnv,
} from '../claudeAuth'
import { resolveAgentRuntime } from '../agentCliConfig'
import { isClaudeModelCliLocked } from '../shared/agentCliConfigPolicy'
import { applyGeminiChildEnvOverrides, getGeminiSpawnEnv } from '../geminiAuth'
import { classifyAcpError, isAuthErrorMessage } from './acpErrors'
import { classifySessionFailure } from './agentHealth'
import { pushConnectionStatus, emitAgentLifecycle } from './connectionStatus'
import { DEFAULT_AGENT_MODE, isAutoApproveMode, normalizeAgentMode } from '../shared/agentMode'
import { mapUiModeToBackend } from '../shared/agentModes'
import { assertWithinWorkspace, pathAssertError, pathAssertResolved, isPathInsideWorkspace, toWorkspaceRelativePath } from '../shared/pathSafety'
import { assessVaultPermission } from '../shared/vaultPermissionGuard'
import { buildCodeBuddySpawnEnv } from '../workspaceCodeBuddy'
import { buildPermissionAllowResponse, pickAllowPermissionOption, pickRejectPermissionOption } from '../shared/acpPermission'
import { ACP_PERMISSION_TIMEOUT_MS } from '../shared/permissionTimeout'
import type { IResponseMessage } from '../shared/responseMessage'
import type { DbWriteOp } from '../shared/sessionUpdatePipeline'
import { computePromptTimeoutRemaining } from '../shared/promptTimeout'
import { normalizeAcpModels, pickGeminiAutoModelId } from '../shared/acpModels'
import {
  buildTurnErrorMessage,
  buildTurnFinishMessage,
  buildTurnStartMessage,
  processSessionUpdate,
  resolveToolFilePathFromUpdate,
  type SessionPipelineContext,
} from '../shared/sessionUpdatePipeline'
import { resolveToolCallId, sanitizeAcpToolUpdate, type ToolCallUpdatePayload } from '../shared/acpToolCallOutput'

export const BACKGROUND_EMPTY_STATE_DISPLAY = '[background-empty-state]'

export { POTENTIAL_ACP_CLIS, LOGO_COLORS }

const JSONRPC_VERSION = '2.0'
const promptTimeoutMs = 300000
const KEEPALIVE_INTERVAL_MS = 30000

let nextRequestId = 0

export interface AgentConfig {
  backend: string
  name: string
  cliPath?: string
  acpArgs?: string[]
  spawnEnv?: Record<string, string>
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timeoutId: NodeJS.Timeout
  method: string
  startTime: number
  promptOriginTime: number
  timeoutMs: number
}

const conversationMap = new Map<string, sessionDb.Conversation>()

function conversationCacheKey(backend: string, workspacePath: string): string {
  return `${backend}::${sessionDb.normalizeWorkspacePath(workspacePath)}`
}

function getOrCreateConversation(backend: string, workspacePath: string) {
  const key = conversationCacheKey(backend, workspacePath)
  if (conversationMap.has(key)) {
    return conversationMap.get(key)!
  }

  let conversation = sessionDb.getConversationByBackend(backend, workspacePath)
  if (!conversation) {
    const id = `${backend}-${Date.now()}`
    conversation = sessionDb.createConversation(id, backend, `${backend} conversation`, {}, workspacePath)
  }

  conversationMap.set(key, conversation)
  console.log(`[DB] Using conversation for ${backend} @ ${sessionDb.normalizeWorkspacePath(workspacePath) || '(none)'}: ${conversation.id}`)
  return conversation
}

function clearConversationCache(backend: string, workspacePath?: string) {
  if (workspacePath != null) {
    conversationMap.delete(conversationCacheKey(backend, workspacePath))
    return
  }
  for (const key of conversationMap.keys()) {
    if (key.startsWith(`${backend}::`)) {
      conversationMap.delete(key)
    }
  }
}

export function clearAllConversationCaches(): void {
  conversationMap.clear()
}

export class BackendConnection {
  config: AgentConfig
  child: ChildProcess | null = null
  sessionId: string | null = null
  models: any = null
  pendingRequests = new Map<number, PendingRequest>()
  promptTimeoutsPaused = false
  buffer = ''
  currentMode = DEFAULT_AGENT_MODE
  currentModelId: string | null = null
  currentMsgId: string | null = null
  currentTurnId: string | null = null
  mainWindow: BrowserWindow | null = null
  initializeResponse: any = null
  availableCommands: Array<{ name: string; description?: string }> = []
  private openedAuthUrls = new Set<string>()
  private promptKeepaliveInterval: NodeJS.Timeout | null = null
  /** Internal prompts (empty-state rethink) — skip chat DB + UI bubbles. */
  private silentPromptTurn = false
  
  private getWorkspacePath: () => string

  private sendToRenderer(channel: string, payload: unknown): void {
    const win = this.mainWindow
    if (!win || win.isDestroyed()) return
    win.webContents.send(channel, payload)
  }
  
  private pendingPermissionRequests = new Map<number, {
    resolve: (value: any) => void
    reject: (reason?: any) => void
    timeoutId: NodeJS.Timeout
  }>()
  private createSessionLock: Promise<{ sessionId: string; cached?: boolean; resumed?: boolean; models?: any; authRequired?: boolean }> | null = null
  private sessionFailure: { error: string; authRequired: boolean; at: number } | null = null
  /** Ground truth: toolCallId → workspace-relative path (from fs write / permission / rawInput). */
  private toolCallFilePaths = new Map<string, string>()
  private activeToolCallId: string | null = null
  
  constructor(config: AgentConfig, getWorkspacePath: () => string) {
    this.config = config
    this.getWorkspacePath = getWorkspacePath
  }

  /** Refresh spawn path when agent list is re-detected (e.g. PATH vs npx). */
  updateSpawnConfig(config: AgentConfig): void {
    if (this.child) return
    this.config = config
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  getSessionFailure(): { error: string; authRequired: boolean; at: number } | null {
    return this.sessionFailure
  }

  private clearSessionFailure(): void {
    this.sessionFailure = null
  }

  private recordSessionFailure(error: unknown, authRequired = false): void {
    const message = error instanceof Error ? error.message : String(error)
    this.sessionFailure = { error: message, authRequired, at: Date.now() }
    emitAgentLifecycle(this.config.backend, authRequired ? 'auth_required' : 'error', { error: message })
    void pushConnectionStatus(this.config.backend, this)
  }

  private tryOpenAuthUrlFromText(text: string): void {
    const urlPattern = /https:\/\/[^\s<>"')\]]+/g
    const urls = text.match(urlPattern) || []
    for (const rawUrl of urls) {
      const url = rawUrl.replace(/[.,;]+$/, '')
      if (this.openedAuthUrls.has(url)) continue
      const isOAuthUrl =
        /accounts\.google\.com|google\.com\/o\/oauth2|oauth2\.googleapis\.com/i.test(url)
      const isDeprecationNotice = /antigravity\.google/i.test(url)
      if (!isOAuthUrl || isDeprecationNotice) continue

      this.openedAuthUrls.add(url)
      console.log(`[${this.config.backend}] Opening OAuth URL in system browser:`, url)
      void shell.openExternal(url).catch((err) => {
        console.error(`[${this.config.backend}] Failed to open auth URL:`, err)
      })
      this.sendToRenderer('acp-auth-url', {
        backend: this.config.backend,
        url,
      })
    }
  }

  private inspectTextForAuthUrl(text: string): void {
    if (!text) return
    this.tryOpenAuthUrlFromText(text)
    if (/no longer supported|antigravity/i.test(text)) {
      this.sendToRenderer('acp-auth-deprecated', {
        backend: this.config.backend,
        message: text.trim().slice(0, 500),
      })
    }
  }

  async connect(): Promise<{ success: boolean; cached?: boolean; error?: string }> {
    if (this.child) {
      console.log(`[${this.config.backend}] Already connected`)
      return { success: true, cached: true }
    }

    const cliPath = this.config.cliPath
    const acpArgs = this.config.acpArgs || []

    const workspacePath = this.getWorkspacePath()
    const spawnEnv = {
      ...this.config.spawnEnv,
      ...(this.config.backend === 'gemini' ? getGeminiSpawnEnv() : {}),
      ...(this.config.backend === 'claude' ? getClaudeSpawnEnv() : {}),
      ...(workspacePath
        ? {
            METAMATES_WORKSPACE: workspacePath,
            INIT_CWD: workspacePath,
            ...(this.config.backend === 'codebuddy' ? buildCodeBuddySpawnEnv(workspacePath) : {}),
          }
        : {}),
    }
    const { command: spawnCmd, args: spawnArgs, options } = createSpawnConfigFromResolved(
      cliPath || '',
      acpArgs,
      workspacePath,
      spawnEnv,
    )
    if (options.env) {
      if (this.config.backend === 'gemini') {
        options.env = applyGeminiChildEnvOverrides(options.env as Record<string, string>)
      } else if (this.config.backend === 'claude') {
        options.env = applyClaudeChildEnvOverrides(options.env as Record<string, string>)
      }
    }

    const startTime = Date.now()
    console.log(`[${this.config.backend}] spawning:`, spawnCmd, spawnArgs, 'cwd:', options.cwd)

    this.child = spawn(spawnCmd, spawnArgs, options)
    trackManagedProcess(this.child.pid)

    this.child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      this.inspectTextForAuthUrl(chunk)
      this.buffer += chunk
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) {
          try {
            this.handleMessage(JSON.parse(line))
          } catch (e: any) {
            console.error(`[${this.config.backend}] parse error:`, e.message)
          }
        }
      }
    })

    this.child.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      console.error(`[${this.config.backend}] STDERR:`, text)
      this.inspectTextForAuthUrl(text)
    })

    this.child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`[${this.config.backend}] child exit:`, code, signal)
      const pid = this.child?.pid
      this.child = null
      this.sessionId = null
      this.models = null
      this.availableCommands = []
      for (const [id, req] of this.pendingRequests) {
        clearTimeout(req.timeoutId)
        req.reject(new Error('Process exited'))
      }
      this.pendingRequests.clear()
      if (pid) {
        untrackManagedProcess(pid)
        killProcessTree(pid, { force: true })
      }
      this.sendToRenderer('disconnected', { code, signal, backend: this.config.backend })
      emitAgentLifecycle(this.config.backend, 'disconnected')
      void pushConnectionStatus(this.config.backend, this)
    })

    try {
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      }, 30000)
      this.initializeResponse = initResult
      if (Array.isArray(initResult?.availableCommands)) {
        this.availableCommands = initResult.availableCommands
      }
      const elapsed = Date.now() - startTime
      console.log(`[${this.config.backend}] initialized in ${elapsed}ms`)
      emitAgentLifecycle(this.config.backend, 'connected')
      void pushConnectionStatus(this.config.backend, this)
      return { success: true }
    } catch (error: any) {
      console.error(`[${this.config.backend}] initialize failed:`, error.message)
      if (this.child) {
        killProcessTree(this.child.pid, { force: true })
        this.child = null
      }
      return { success: false, error: error.message }
    }
  }

  sendRequest<T = any>(method: string, params?: Record<string, any>, customTimeoutMs?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.child || !this.child.stdin) {
        reject(new Error('Not connected'))
        return
      }
      const id = nextRequestId++
      const msg = { jsonrpc: JSONRPC_VERSION, id, method, ...(params && { params }) }
      const timeoutMs = customTimeoutMs || (method === 'session/prompt' ? promptTimeoutMs : 180000)
      const now = Date.now()
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        if (method === 'session/prompt') {
          this.stopPromptKeepalive()
          this.emitEndTurn(`Request ${method} timed out`)
        }
        reject(new Error(`Request ${method} timed out`))
      }, timeoutMs)
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId: timeout,
        method,
        startTime: now,
        promptOriginTime: now,
        timeoutMs,
      })
      if (method === 'session/prompt') {
        this.startPromptKeepalive()
      }
      this.child.stdin.write(JSON.stringify(msg) + '\n')
    })
  }

  private isChildAlive(): boolean {
    return this.child !== null
      && !this.child.killed
      && this.child.exitCode === null
      && this.child.signalCode === null
  }

  private startPromptKeepalive(): void {
    this.stopPromptKeepalive()
    this.promptKeepaliveInterval = setInterval(() => {
      if (!this.isChildAlive()) return
      const now = Date.now()
      const hasEligible = [...this.pendingRequests.values()].some(
        (r) => r.method === 'session/prompt' && now - r.promptOriginTime < r.timeoutMs
      )
      if (hasEligible) {
        this.resetPromptTimeout()
      }
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopPromptKeepalive(): void {
    if (this.promptKeepaliveInterval) {
      clearInterval(this.promptKeepaliveInterval)
      this.promptKeepaliveInterval = null
    }
  }

  /** Always notify UI when a prompt turn ends — emits finish stream message + legacy end-turn. */
  private emitEndTurn(error?: string): void {
    const wasSilent = this.silentPromptTurn
    const ctx = this.buildPipelineContext()
    if (error) {
      this.emitStreamMessage(buildTurnErrorMessage(ctx, error))
    }
    this.emitStreamMessage(buildTurnFinishMessage(ctx))
    this.currentMsgId = null
    this.currentTurnId = null
    this.silentPromptTurn = false
    this.stopPromptKeepalive()
    sessionDb.flushAllPendingMessages()
    this.sendToRenderer('end-turn', { backend: this.config.backend, silent: wasSilent })
  }

  private buildPipelineContext(): SessionPipelineContext {
    const conversation = getOrCreateConversation(this.config.backend, this.getWorkspacePath())
    const turnId = this.currentTurnId || sessionDb.generateId()
    if (!this.currentTurnId) this.currentTurnId = turnId
    return {
      backend: this.config.backend,
      conversationId: conversation.id,
      turnId,
      agentMsgId: this.currentMsgId,
      assignAgentMsgId: () => {
        if (!this.currentMsgId) {
          this.currentMsgId = sessionDb.generateId()
        }
        return this.currentMsgId
      },
      clearAgentMsgId: () => {
        this.currentMsgId = null
      },
    }
  }

  private emitStreamMessage(message: IResponseMessage): void {
    this.sendToRenderer('acp-stream-message', {
      backend: this.config.backend,
      message,
      silent: this.silentPromptTurn,
    })
  }

  private rememberToolCallPath(toolCallId: string, filePath: string): void {
    const workspace = this.getWorkspacePath()
    if (!workspace) return
    const relative = toWorkspaceRelativePath(workspace, filePath)
    if (!relative) {
      console.log(`[${this.config.backend}] Ignoring tool path outside vault: ${filePath}`)
      return
    }
    this.toolCallFilePaths.set(toolCallId, relative)
  }

  private captureToolCallPathFromPayload(payload: Record<string, unknown>): void {
    const toolCallId = resolveToolCallId(payload)
    if (!toolCallId) return
    this.activeToolCallId = toolCallId
    const filePath = resolveToolFilePathFromUpdate(sanitizeAcpToolUpdate(payload as ToolCallUpdatePayload))
    if (filePath) {
      this.rememberToolCallPath(toolCallId, filePath)
    }
  }

  private enrichToolSessionUpdate(update: Record<string, unknown>): Record<string, unknown> {
    const sessionUpdate = update.sessionUpdate as string | undefined
    if (sessionUpdate !== 'tool_call' && sessionUpdate !== 'tool_call_update') {
      return update
    }
    this.captureToolCallPathFromPayload(update)
    const toolCallId = resolveToolCallId(update)
    const known = toolCallId ? this.toolCallFilePaths.get(toolCallId) : undefined
    if (known && typeof update.toolFilePath !== 'string') {
      return { ...update, toolFilePath: known }
    }
    return update
  }

  private patchToolCallFilePath(conversationId: string, toolCallId: string, filePath: string): void {
    this.applyDbWrite(conversationId, {
      kind: 'update_tool',
      payload: { toolCallId, toolFilePath: filePath },
    })
    const ctx = this.buildPipelineContext()
    this.emitStreamMessage({
      conversation_id: conversationId,
      type: 'acp_tool_call',
      msg_id: toolCallId,
      turn_id: ctx.turnId,
      position: 'left',
      status: 'work',
      created_at: Date.now(),
      data: {
        update: {
          toolCallId,
          toolFilePath: filePath,
        },
      },
    })
  }

  private applyDbWrite(conversationId: string, op: DbWriteOp): void {
    if (this.silentPromptTurn) return
    switch (op.kind) {
      case 'accumulate_text': {
        const { msg_id, content } = op.payload as { msg_id: string; content: string }
        sessionDb.accumulateMessage({
          conversation_id: conversationId,
          type: 'text',
          content: { content },
          position: 'left',
          status: 'streaming',
          msg_id,
        })
        break
      }
      case 'insert_tool': {
        const payload = op.payload as {
          toolCallId: string
          title?: string
          kind?: string
          status?: string
          rawInput?: unknown
          locations?: unknown
          content?: unknown
          toolFilePath?: string
        }
        sessionDb.insertMessage({
          conversation_id: conversationId,
          type: 'acp_tool_call',
          msg_id: payload.toolCallId,
          content: {
            update: {
              toolCallId: payload.toolCallId,
              title: payload.title,
              kind: payload.kind,
              status: payload.status || 'in_progress',
              rawInput: payload.rawInput,
              locations: payload.locations,
              content: payload.content,
              toolFilePath: payload.toolFilePath,
            },
          },
          position: 'left',
          status: 'streaming',
        }, true)
        break
      }
      case 'update_tool': {
        const payload = op.payload as {
          toolCallId: string
          status?: string
          title?: string
          kind?: string
          content?: unknown
          rawInput?: unknown
          locations?: unknown
          toolFilePath?: string
        }
        const messages = sessionDb.getAllConversationMessages(conversationId)
        for (const m of messages) {
          if (m.type === 'acp_tool_call' && m.content?.update?.toolCallId === payload.toolCallId) {
            const prev = m.content.update as Record<string, unknown>
            sessionDb.updateMessage(m.id, {
              update: {
                ...prev,
                status: payload.status ?? prev.status,
                title: payload.title || prev.title,
                kind: payload.kind || prev.kind,
                content: payload.content ?? prev.content,
                rawInput: payload.rawInput ?? prev.rawInput,
                locations: payload.locations ?? prev.locations,
                toolFilePath: payload.toolFilePath ?? prev.toolFilePath,
              },
            })
            break
          }
        }
        break
      }
      case 'insert_plan': {
        const { sessionId, entries } = op.payload as { sessionId?: string; entries: unknown[] }
        sessionDb.insertMessage({
          conversation_id: conversationId,
          type: 'plan',
          content: { sessionId, entries },
          position: 'left',
          status: 'streaming',
        }, true)
        break
      }
    }
  }

  private handleSessionUpdateViaPipeline(update: Record<string, unknown>): void {
    const conversation = getOrCreateConversation(this.config.backend, this.getWorkspacePath())
    const enriched = this.enrichToolSessionUpdate(update)
    const ctx = this.buildPipelineContext()
    const { stream, db } = processSessionUpdate(enriched, ctx)
    for (const op of db) {
      this.applyDbWrite(conversation.id, op)
    }
    for (const message of stream) {
      this.emitStreamMessage(message)
    }
  }

  getAuthMethods(): Array<{ id: string; name?: string }> {
    return this.initializeResponse?.authMethods || []
  }

  isAuthError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error)
    return isAuthErrorMessage(msg)
  }

  async authenticate(methodId?: string, meta?: Record<string, unknown>): Promise<any> {
    console.log(`[${this.config.backend}] authenticate`, methodId || '(default)', meta ? '(with meta)' : '')
    const params: Record<string, unknown> = {}
    if (methodId) params.methodId = methodId
    if (meta) params._meta = meta
    return await this.sendRequest(
      'authenticate',
      Object.keys(params).length ? params : undefined,
      120000
    )
  }

  private rejectPromptTimeout(id: number, request: {
    reject: (error: Error) => void
    timeoutId: NodeJS.Timeout
  }): void {
    clearTimeout(request.timeoutId)
    this.pendingRequests.delete(id)
    this.stopPromptKeepalive()
    this.emitEndTurn('Request session/prompt timed out')
    request.reject(new Error('Request session/prompt timed out'))
  }

  resetPromptTimeout(): void {
    if (this.promptTimeoutsPaused) return
    for (const [id, request] of this.pendingRequests) {
      if (request.method !== 'session/prompt') continue
      const remaining = computePromptTimeoutRemaining(request.promptOriginTime, request.timeoutMs)
      if (remaining <= 0) {
        this.rejectPromptTimeout(id, request)
        continue
      }
      clearTimeout(request.timeoutId)
      request.startTime = Date.now()
      request.timeoutId = setTimeout(() => {
        this.rejectPromptTimeout(id, request)
      }, remaining)
    }
  }

  pausePromptTimeouts(): void {
    this.promptTimeoutsPaused = true
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt') {
        clearTimeout(request.timeoutId)
      }
    }
  }

  resumePromptTimeouts(): void {
    this.promptTimeoutsPaused = false
    this.resetPromptTimeout()
  }

  handleMessage(msg: any): void {
    if (msg.method) {
      if (msg.method === 'session/request_permission') {
        console.log(`[${this.config.backend}] permission request:`, JSON.stringify(msg.params).substring(0, 500))
        const permissionToolCall = msg.params?.toolCall as Record<string, unknown> | undefined
        if (permissionToolCall) {
          this.captureToolCallPathFromPayload(permissionToolCall)
        }

        const vaultGuard = assessVaultPermission(this.getWorkspacePath(), permissionToolCall)
        const rejectPermissionRequest = (reason: string) => {
          console.log(`[${this.config.backend}] Permission auto-rejected: ${reason}`)
          const response = {
            jsonrpc: JSONRPC_VERSION,
            id: msg.id,
            result: {
              outcome: {
                outcome: 'rejected',
                optionId: pickRejectPermissionOption(msg.params?.options),
              },
            },
          }
          this.child?.stdin?.write(JSON.stringify(response) + '\n')
          this.resumePromptTimeouts()
        }

        if (!vaultGuard.allowed) {
          rejectPermissionRequest(
            vaultGuard.reason
              + (vaultGuard.blockedPaths?.length ? ` (${vaultGuard.blockedPaths.join(', ')})` : ''),
          )
          return
        }

        this.pausePromptTimeouts()
        
        const autoApprove = isAutoApproveMode(this.currentMode)
        
        if (autoApprove) {
          const response = buildPermissionAllowResponse(msg.id, msg.params?.options)
          console.log(`[${this.config.backend}] Auto-approving with optionId:`, response.result.outcome.optionId)
          this.child?.stdin?.write(JSON.stringify(response) + '\n')
          this.resumePromptTimeouts()
        } else {
          const requestId = msg.id
          const finishPermission = (respond: () => void) => {
            const pending = this.pendingPermissionRequests.get(requestId)
            if (!pending) return
            clearTimeout(pending.timeoutId)
            this.pendingPermissionRequests.delete(requestId)
            respond()
            this.resumePromptTimeouts()
          }
          const timeoutId = setTimeout(() => {
            console.log(`[${this.config.backend}] Permission request ${requestId} timed out (${ACP_PERMISSION_TIMEOUT_MS}ms)`)
            finishPermission(() => {
              const response = {
                jsonrpc: JSONRPC_VERSION,
                id: requestId,
                result: {
                  outcome: {
                    outcome: 'rejected',
                    optionId: pickRejectPermissionOption(msg.params?.options),
                  },
                },
              }
              this.child?.stdin?.write(JSON.stringify(response) + '\n')
            })
          }, ACP_PERMISSION_TIMEOUT_MS)
          this.pendingPermissionRequests.set(requestId, {
            resolve: (value: any) => {
              finishPermission(() => {
                const optionId = value?.optionId || pickAllowPermissionOption(msg.params?.options)
                const response = {
                  jsonrpc: JSONRPC_VERSION,
                  id: requestId,
                  result: {
                    outcome: {
                      outcome: 'selected',
                      optionId,
                    },
                  },
                }
                console.log(`[${this.config.backend}] Responding to permission with optionId:`, optionId)
                this.child?.stdin?.write(JSON.stringify(response) + '\n')
              })
            },
            reject: () => {
              finishPermission(() => {
                const response = {
                  jsonrpc: JSONRPC_VERSION,
                  id: requestId,
                  result: {
                    outcome: {
                      outcome: 'rejected',
                      optionId: pickRejectPermissionOption(msg.params?.options),
                    },
                  },
                }
                this.child?.stdin?.write(JSON.stringify(response) + '\n')
              })
            },
            timeoutId,
          })
          
          this.sendToRenderer('permission-request', {
            backend: this.config.backend,
            requestId,
            ...msg.params
          })
        }
      } else if (msg.method === 'session/update') {
        this.resetPromptTimeout()
        const updateContent = JSON.stringify(msg.params?.update || {})
        console.log(`[${this.config.backend}] session/update length:`, updateContent.length)
        console.log(`[${this.config.backend}] session/update preview:`, updateContent.substring(0, 200))
        if (updateContent.length > 10000) {
          console.log(`[${this.config.backend}] WARNING: Large update (${updateContent.length} chars)`)
        }
        
        const update = msg.params?.update
        if (update && typeof update === 'object') {
          this.handleSessionUpdateViaPipeline(update as Record<string, unknown>)
        }
      } else if (msg.method === 'fs/read_text_file') {
        const guard = assertWithinWorkspace(this.getWorkspacePath(), msg.params.path)
        const pathError = pathAssertError(guard)
        const resolved = pathAssertResolved(guard)
        if (pathError || !resolved) {
          const response = { jsonrpc: JSONRPC_VERSION, id: msg.id, error: { message: pathError || 'Invalid path' } }
          this.child?.stdin?.write(JSON.stringify(response) + '\n')
        } else {
          fsPromises.readFile(resolved, 'utf-8').then(content => {
            const response = { jsonrpc: JSONRPC_VERSION, id: msg.id, result: { content } }
            this.child?.stdin?.write(JSON.stringify(response) + '\n')
          }).catch(err => {
            const response = { jsonrpc: JSONRPC_VERSION, id: msg.id, error: { message: err.message } }
            this.child?.stdin?.write(JSON.stringify(response) + '\n')
          })
        }
      } else if (msg.method === 'fs/write_text_file') {
        const guard = assertWithinWorkspace(this.getWorkspacePath(), msg.params.path)
        const pathError = pathAssertError(guard)
        const resolved = pathAssertResolved(guard)
        if (pathError || !resolved) {
          const response = { jsonrpc: JSONRPC_VERSION, id: msg.id, error: { message: pathError || 'Invalid path' } }
          this.child?.stdin?.write(JSON.stringify(response) + '\n')
        } else {
          fsPromises.writeFile(resolved, msg.params.content, 'utf-8').then(() => {
            const conversation = getOrCreateConversation(this.config.backend, this.getWorkspacePath())
            const workspace = this.getWorkspacePath()
            const relativePath = workspace ? toWorkspaceRelativePath(workspace, resolved) : null
            if (this.activeToolCallId && relativePath) {
              this.rememberToolCallPath(this.activeToolCallId, relativePath)
              this.patchToolCallFilePath(conversation.id, this.activeToolCallId, relativePath)
            }
            const response = { jsonrpc: JSONRPC_VERSION, id: msg.id, result: null }
            this.child?.stdin?.write(JSON.stringify(response) + '\n')
          }).catch(err => {
            const response = { jsonrpc: JSONRPC_VERSION, id: msg.id, error: { message: err.message } }
            this.child?.stdin?.write(JSON.stringify(response) + '\n')
          })
        }
      }
    } else if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const request = this.pendingRequests.get(msg.id)!
      const { resolve, reject, timeoutId, method } = request
      clearTimeout(timeoutId)
      this.pendingRequests.delete(msg.id)
      if (method === 'session/prompt') {
        if (msg.error) {
          const errText = msg.error.message || JSON.stringify(msg.error)
          this.emitEndTurn(errText)
        } else {
          this.emitEndTurn()
        }
      }
      if (msg.result !== undefined) {
        resolve(msg.result)
      } else if (msg.error) {
        const errText = msg.error.message || JSON.stringify(msg.error)
        this.inspectTextForAuthUrl(errText)
        const classified = classifyAcpError(new Error(errText))
        const err = new Error(classified.message) as Error & { quotaExceeded?: boolean; authRequired?: boolean }
        err.quotaExceeded = classified.quotaExceeded
        err.authRequired = classified.authRequired
        reject(err)
      }
    }
  }

  private async sendSessionNewRequest(
    workspacePath: string,
    mcpServers: ReturnType<typeof buildMetaMatesMcpServers>,
    resumeSessionId?: string | null,
  ): Promise<any> {
    const buildPayload = (servers: typeof mcpServers) =>
      this.config.backend === 'claude'
        ? buildClaudeSessionNewPayload(workspacePath, servers, resumeSessionId ?? undefined)
        : { cwd: workspacePath, mcpServers: servers }

    try {
      return await this.sendRequest('session/new', buildPayload(mcpServers))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      const retryWithoutMcp =
        this.config.backend === 'claude' &&
        mcpServers.length > 0 &&
        /internal error|query closed/i.test(msg)
      if (!retryWithoutMcp) throw error
      console.warn(
        `[claude] session/new with ${mcpServers.length} MCP server(s) failed (${msg}); retrying without MCP`,
      )
      return await this.sendRequest('session/new', buildPayload([]))
    }
  }

  private async doCreateSession(resume = true): Promise<{ sessionId: string; cached?: boolean; resumed?: boolean; models?: any }> {
    if (this.sessionId) {
      console.log(`[${this.config.backend}] session already exists:`, this.sessionId)
      return { sessionId: this.sessionId, cached: true }
    }

    const workspacePath = this.getWorkspacePath()
    const savedSession = sessionStore.getSession(this.config.backend, workspacePath)
    let resumeSessionId = resume && savedSession?.sessionId ? savedSession.sessionId : null
    if (this.config.backend === 'claude' && resolveAgentRuntime('claude').capabilities.skipSessionResume) {
      resumeSessionId = null
    }
    
    const mcpServers = buildMetaMatesMcpServers()
    
    if (resumeSessionId) {
      console.log(`[${this.config.backend}] attempting to resume session:`, resumeSessionId)
      try {
        let result
        
        const isClaudeOrCodebuddy = this.config.backend === 'claude' || this.config.backend === 'codebuddy'
        
        if (isClaudeOrCodebuddy) {
          const resumeRequest =
            this.config.backend === 'claude'
              ? this.sendSessionNewRequest(workspacePath, mcpServers, resumeSessionId)
              : this.sendRequest('session/new', {
                  cwd: workspacePath,
                  mcpServers,
                  _meta: {
                    claudeCode: {
                      options: { resume: resumeSessionId },
                    },
                  },
                })
          result = await Promise.race([
            resumeRequest,
            new Promise<never>((_, reject) => {
              const resumeMs = this.config.backend === 'claude' ? 30_000 : 15_000
              setTimeout(() => reject(new Error('Resume timed out')), resumeMs)
            }),
          ])
        } else {
          result = await this.sendRequest('session/new', {
            cwd: workspacePath,
            mcpServers,
            resumeSessionId: resumeSessionId
          })
        }
        
        if (result.sessionId) {
          this.sessionId = result.sessionId
          this.clearSessionFailure()
          this.currentMode = normalizeAgentMode(savedSession.mode)
          this.currentModelId = this.config.backend === 'claude'
            ? this.resolveClaudeSessionModelId(savedSession.modelId)
            : (savedSession.modelId || null)
          console.log(`[${this.config.backend}] resumed session:`, this.sessionId)
          if (result.models) {
            this.models = result.models
          }
          
          if (result.sessionId !== resumeSessionId) {
            await sessionStore.setSession(this.config.backend, {
              sessionId: this.sessionId,
              mode: this.currentMode,
              modelId: this.currentModelId,
            }, workspacePath)
          }

          emitAgentLifecycle(this.config.backend, 'session_active')
          void pushConnectionStatus(this.config.backend, this)

          if (this.config.backend === 'claude') {
            await this.syncClaudeSessionModelFromCliConfig()
          }
          
          return { sessionId: this.sessionId, resumed: true }
        }
      } catch (e: any) {
        console.log(`[${this.config.backend}] resume failed, creating new session:`, e.message)
        if (resumeSessionId) {
          await sessionStore.clearSession(this.config.backend, workspacePath)
        }
      }
    }

    const result = await this.sendSessionNewRequest(workspacePath, mcpServers)
    this.sessionId = result.sessionId
    this.clearSessionFailure()
    if (Array.isArray(result?.availableCommands)) {
      this.availableCommands = result.availableCommands
    }
    console.log(`[${this.config.backend}] new session:`, this.sessionId)
    
    if (result.models) {
      this.models = result.models
    }
    
    await sessionStore.setSession(this.config.backend, {
      sessionId: this.sessionId,
      mode: this.currentMode,
      modelId: this.currentModelId,
    }, workspacePath)

    await this.ensureGeminiAutoModelIfNeeded()

    emitAgentLifecycle(this.config.backend, 'session_active')
    void pushConnectionStatus(this.config.backend, this)
    
    return result
  }

  async recreateSession(resume = false): Promise<{ sessionId: string; cached?: boolean; resumed?: boolean; models?: any }> {
    this.sessionId = null
    return await this.doCreateSession(resume)
  }

  async createSession(resume = true): Promise<{ sessionId: string; cached?: boolean; resumed?: boolean; models?: any; authRequired?: boolean }> {
    if (this.createSessionLock) {
      return this.createSessionLock
    }

    const run = async () => {
      try {
        const result = await this.doCreateSession(resume)
        await this.ensurePermissionMode()
        await this.ensureClaudeEnvModelIfNeeded()
        return result
      } catch (error: any) {
        const authRequired = this.isAuthError(error) || !!error.authRequired
        this.recordSessionFailure(error, authRequired)
        if (this.isAuthError(error)) {
          console.log(`[${this.config.backend}] session failed, trying authenticate:`, error.message)
          const authMethods = this.getAuthMethods()
          for (const method of authMethods.length > 0 ? authMethods : [{ id: undefined }]) {
            try {
              await this.authenticate(method.id)
              const result = await this.doCreateSession(resume)
              await this.ensurePermissionMode()
              await this.ensureClaudeEnvModelIfNeeded()
              return result
            } catch (authErr: any) {
              console.log(`[${this.config.backend}] authenticate (${method.id || 'default'}) failed:`, authErr.message)
            }
          }
          throw Object.assign(error, { authRequired: true, authMethods: this.getAuthMethods() })
        }
        throw error
      }
    }

    this.createSessionLock = run().finally(() => {
      this.createSessionLock = null
    })
    return this.createSessionLock
  }

  private async ensurePermissionMode(): Promise<void> {
    if (!this.sessionId) return
    try {
      await this.setMode(this.currentMode)
    } catch (e: any) {
      console.log(`[${this.config.backend}] ensurePermissionMode failed:`, e.message)
    }
  }

  async getModels(): Promise<{ models: { id: string; name: string }[]; currentModelId?: string }> {
    if (this.models) return normalizeAcpModels(this.models)
    if (!this.sessionId) return { models: [] }
    try {
      const result = await this.sendRequest('session/get_models', { sessionId: this.sessionId })
      this.models = result
      return normalizeAcpModels(result)
    } catch {
      return normalizeAcpModels(this.models)
    }
  }

  private resolveClaudeSessionModelId(storedModelId: string | null | undefined): string | null {
    const settingsEnv = readClaudeSettingsEnv()
    if (isClaudeModelCliLocked(settingsEnv)) {
      return getClaudePreferredModelId()
    }
    return storedModelId?.trim() || null
  }

  /** Keep ACP session model aligned with ~/.claude/settings.json — same source as CLI in PowerShell. */
  private async syncClaudeSessionModelFromCliConfig(): Promise<void> {
    if (this.config.backend !== 'claude' || !this.sessionId) return
    const runtime = resolveAgentRuntime('claude')
    const cliModel = runtime.display.effectiveModel
    if (!cliModel) return

    this.currentModelId = cliModel
    await sessionStore.setSession(this.config.backend, {
      sessionId: this.sessionId,
      mode: this.currentMode,
      modelId: cliModel,
    }, this.getWorkspacePath())

    if (!runtime.capabilities.canSwitchModel) {
      console.log(`[claude] session model from CLI config: ${cliModel} (${runtime.display.provenanceModel ?? 'settings'})`)
      try {
        await this.sendRequest('session/set_model', { sessionId: this.sessionId, modelId: cliModel })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.log(`[claude] session/set_model to CLI model failed:`, msg)
      }
    }
  }

  private async ensureClaudeEnvModelIfNeeded(): Promise<void> {
    await this.syncClaudeSessionModelFromCliConfig()
  }

  private async ensureGeminiAutoModelIfNeeded(): Promise<void> {
    if (this.config.backend !== 'gemini' || !this.sessionId) return
    const { models } = normalizeAcpModels(this.models)
    const autoId = pickGeminiAutoModelId(models)
    if (!autoId) return
    if (this.currentModelId === autoId) return
  // Prefer Auto when session has no explicit model (matches Gemini CLI terminal default).
    if (!this.currentModelId) {
      try {
        await this.setModel(autoId)
        console.log(`[gemini] default model: ${autoId}`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.log(`[gemini] set Auto model failed:`, msg)
      }
    }
  }

  async setModel(modelId: string): Promise<any> {
    if (!this.sessionId) throw new Error('No session')
    if (this.config.backend === 'claude') {
      const runtime = resolveAgentRuntime('claude')
      if (!runtime.capabilities.canSwitchModel) {
        const cliModel = runtime.display.effectiveModel ?? modelId
        this.currentModelId = cliModel
        console.log(`[claude] model locked by CLI settings — syncing session to ${cliModel}`)
        try {
          await this.sendRequest('session/set_model', { sessionId: this.sessionId, modelId: cliModel })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.log(`[claude] session/set_model (locked) failed:`, msg)
        }
        await sessionStore.setSession(this.config.backend, {
          sessionId: this.sessionId,
          mode: this.currentMode,
          modelId: cliModel,
        }, this.getWorkspacePath())
        return { modelId: cliModel, skipped: true, synced: true }
      }
    }
    const result = await this.sendRequest('session/set_model', { sessionId: this.sessionId, modelId })
    this.currentModelId = modelId
    await sessionStore.setSession(this.config.backend, {
      sessionId: this.sessionId,
      mode: this.currentMode,
      modelId: this.currentModelId,
    }, this.getWorkspacePath())
    return result
  }

  async setMode(mode: string): Promise<{ success: boolean; mode?: string }> {
    if (!this.sessionId) throw new Error('No session')

    const backendMode = mapUiModeToBackend(this.config.backend, mode)

    try {
      await this.sendRequest('session/set_mode', {
        sessionId: this.sessionId,
        mode: backendMode,
      })
    } catch {
      console.log(`[${this.config.backend}] set_mode not supported, using local mode`)
    }

    this.currentMode = mode
    await sessionStore.setSession(this.config.backend, {
      sessionId: this.sessionId,
      mode: this.currentMode,
      modelId: this.currentModelId,
    }, this.getWorkspacePath())

    return { success: true, mode: this.currentMode }
  }

  getMode(): string {
    return this.currentMode
  }

  rejectPermission(requestId: number): void {
    const pending = this.pendingPermissionRequests.get(requestId)
    if (pending) {
      pending.reject()
    }
  }

  getAvailableCommands(): Array<{ name: string; description?: string }> {
    if (this.availableCommands.length > 0) return this.availableCommands
    const fromInit = this.initializeResponse?.availableCommands
    if (Array.isArray(fromInit)) return fromInit
    return []
  }

  respondToPermission(requestId: number, optionId: string): void {
    const pending = this.pendingPermissionRequests.get(requestId)
    if (pending) {
      pending.resolve({ optionId })
    }
  }

  async sendPrompt(
    text: string,
    presetContext: string | null = null,
    attachments: Array<{ path: string; name: string }> = [],
    displayContent?: string
  ): Promise<any> {
    if (!this.sessionId) throw new Error('No session')

    // Some internal/background prompts should not be visible in the chat UI.
    // We keep the prompt running through the same pipeline but skip inserting
    // a user-visible message into the session DB.
    const shouldPersistUserBubble = displayContent !== BACKGROUND_EMPTY_STATE_DISPLAY
    this.silentPromptTurn = displayContent === BACKGROUND_EMPTY_STATE_DISPLAY
    if (shouldPersistUserBubble) {
      const conversation = getOrCreateConversation(this.config.backend, this.getWorkspacePath())
      sessionDb.insertMessage({
        conversation_id: conversation.id,
        type: 'text',
        content: {
          content: text,
          display: displayContent || text,
          ...(attachments.length > 0 ? { attachments } : {}),
        },
        position: 'right',
        status: 'finish',
      }, true)
    }
    this.currentMsgId = null
    this.currentTurnId = sessionDb.generateId()

    let finalText = text
    if (presetContext) {
      finalText = `[Assistant Rules - You MUST follow these instructions]\n${presetContext}\n\n[User Request]\n${text}`
    }

    this.emitStreamMessage(buildTurnStartMessage(this.buildPipelineContext()))

    return await this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text: finalText }],
    })
  }

  cancelPrompt(): void {
    if (!this.sessionId || !this.child?.stdin) return

    this.child.stdin.write(JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      method: 'session/cancel',
      params: { sessionId: this.sessionId },
    }) + '\n')

    let cancelledPrompt = false
    for (const [id, req] of this.pendingRequests) {
      if (req.method === 'session/prompt') {
        clearTimeout(req.timeoutId)
        this.pendingRequests.delete(id)
        req.resolve(null)
        cancelledPrompt = true
      }
    }
    if (cancelledPrompt) {
      this.emitEndTurn()
    }
  }

  disconnect(): void {
    this.clearSessionFailure()
    this.stopPromptKeepalive()
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timeoutId)
      req.reject(new Error('Disconnected'))
    }
    this.pendingRequests.clear()
    for (const pending of this.pendingPermissionRequests.values()) {
      clearTimeout(pending.timeoutId)
    }
    this.pendingPermissionRequests.clear()
    
    if (this.child) {
      const pid = this.child.pid
      this.child.stdout?.removeAllListeners()
      this.child.stderr?.removeAllListeners()
      this.child.removeAllListeners('exit')
      try {
        this.child.stdin?.end()
      } catch {
        /* ignore */
      }
      untrackManagedProcess(pid)
      killProcessTree(pid, { force: true })
      this.child = null
    }
    this.sessionId = null
    this.models = null
    this.availableCommands = []

    this.sendToRenderer('disconnected', {
      code: null,
      signal: null,
      backend: this.config.backend,
      intentional: true,
    })
    emitAgentLifecycle(this.config.backend, 'disconnected')
    void pushConnectionStatus(this.config.backend, this)

    clearConversationCache(this.config.backend, this.getWorkspacePath())
  }
}
