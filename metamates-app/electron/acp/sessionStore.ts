import * as fs from 'fs'
import * as path from 'path'
import { writeFileAtomic } from '../shared/atomicWrite'
import { DEFAULT_AGENT_MODE } from '../shared/agentMode'
import { normalizeWorkspacePath } from './sessionDb'
import { getWritableAppDataDir } from '../shared/appPaths'

function resolveSessionStorePath(): string {
  return process.env.SESSION_STORE_PATH || path.join(getWritableAppDataDir(), 'session-store.json')
}

interface SessionData {
  sessionId: string
  mode: string
  modelId?: string
  conversation?: unknown
  workspacePath?: string
  updatedAt?: number
}

function sessionKey(backend: string, workspacePath?: string): string {
  const ws = normalizeWorkspacePath(workspacePath || '')
  return ws ? `${backend}::${ws}` : backend
}

class SessionStore {
  private sessions: Record<string, SessionData> = {}

  async load(): Promise<void> {
    const sessionFile = resolveSessionStorePath()
    try {
      const data = await fs.promises.readFile(sessionFile, 'utf-8')
      this.sessions = JSON.parse(data)
      console.log('[SessionStore] Loaded sessions:', Object.keys(this.sessions))
    } catch {
      this.sessions = {}
      console.log('[SessionStore] No existing sessions')
    }
  }

  async save(): Promise<void> {
    const sessionFile = resolveSessionStorePath()
    try {
      writeFileAtomic(sessionFile, JSON.stringify(this.sessions, null, 2))
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[SessionStore] Save error:', message)
    }
  }

  getSession(backend: string, workspacePath?: string): SessionData | null {
    const keyed = sessionKey(backend, workspacePath)
    if (this.sessions[keyed]) return this.sessions[keyed]
    if (workspacePath) {
      const legacy = this.sessions[backend]
      if (legacy && !legacy.workspacePath) return legacy
    }
    return null
  }

  async setSession(backend: string, data: SessionData, workspacePath?: string): Promise<void> {
    const key = sessionKey(backend, workspacePath)
    this.sessions[key] = {
      ...data,
      workspacePath: normalizeWorkspacePath(workspacePath || data.workspacePath || ''),
      updatedAt: Date.now(),
    }
    await this.save()
  }

  async updateConversation(backend: string, conversationData: unknown, workspacePath?: string): Promise<void> {
    const key = sessionKey(backend, workspacePath)
    if (!this.sessions[key]) {
      this.sessions[key] = { sessionId: '', mode: DEFAULT_AGENT_MODE, workspacePath: normalizeWorkspacePath(workspacePath || '') }
    }
    this.sessions[key].conversation = conversationData
    this.sessions[key].updatedAt = Date.now()
    await this.save()
  }

  getConversation(backend: string, workspacePath?: string): unknown {
    return this.getSession(backend, workspacePath)?.conversation || null
  }

  async clearSession(backend: string, workspacePath?: string): Promise<void> {
    delete this.sessions[sessionKey(backend, workspacePath)]
    if (!workspacePath) {
      for (const key of Object.keys(this.sessions)) {
        if (key === backend || key.startsWith(`${backend}::`)) {
          delete this.sessions[key]
        }
      }
    }
    await this.save()
  }
}

const sessionStore = new SessionStore()

export { sessionStore, SessionStore }
