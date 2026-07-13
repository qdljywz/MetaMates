import { workspaceIndexService } from '../services/workspaceIndex'
import type { AppSettings } from '../services/storage'
import type { ConversationHistoryResult, FileInfo, SessionMessage } from '../types/electron'

const SPLASH_HISTORY_LIMIT = 50

/** Set during splash initApp — FileTreePanel skips duplicate initWorkspace. */
export interface MetamatesStartupFlags {
  workspacePath?: string
  workspaceInitDone?: boolean
  indexAttached?: boolean
  fileTreeReady?: boolean
}

export interface StartupAgentHistoryCache {
  backend: string
  messages: SessionMessage[]
  total?: number
  hasMore?: boolean
}

export interface StartupFileTreeCache {
  workspacePath: string
  files: FileInfo[]
}

declare global {
  interface Window {
    __METAMATES_STARTUP__?: MetamatesStartupFlags
    __METAMATES_STARTUP_BACKEND__?: string
    __METAMATES_STARTUP_HISTORY__?: StartupAgentHistoryCache
    __METAMATES_STARTUP_FILE_TREE__?: StartupFileTreeCache
  }
}

export function markStartupWorkspaceInit(workspacePath: string): void {
  window.__METAMATES_STARTUP__ = {
    ...window.__METAMATES_STARTUP__,
    workspacePath,
    workspaceInitDone: true,
  }
}

export function wasStartupWorkspaceInitDone(workspacePath: string): boolean {
  const flags = window.__METAMATES_STARTUP__
  return Boolean(flags?.workspaceInitDone && flags.workspacePath === workspacePath)
}

export function wasStartupIndexAttached(workspacePath: string): boolean {
  const flags = window.__METAMATES_STARTUP__
  return Boolean(flags?.indexAttached && flags.workspacePath === workspacePath)
}

export function wasStartupFileTreeReady(workspacePath: string): boolean {
  const flags = window.__METAMATES_STARTUP__
  return Boolean(flags?.fileTreeReady && flags.workspacePath === workspacePath)
}

export function consumeStartupFileTreeCache(workspacePath: string): FileInfo[] | null {
  const cache = window.__METAMATES_STARTUP_FILE_TREE__
  if (!cache || cache.workspacePath !== workspacePath) return null
  delete window.__METAMATES_STARTUP_FILE_TREE__
  return cache.files
}

export function consumeStartupHistoryCache(backend: string): StartupAgentHistoryCache | null {
  const cache = window.__METAMATES_STARTUP_HISTORY__
  if (!cache || cache.backend !== backend) return null
  return cache
}

export function hasStartupHistoryCache(backend: string): boolean {
  return consumeStartupHistoryCache(backend) != null
}

/** Block until ACP IPC handlers are registered (splash preload must await this). */
export async function waitForDesktopReady(): Promise<void> {
  if (!window.electronAPI?.waitDesktopReady) return
  try {
    await window.electronAPI.waitDesktopReady()
  } catch (err) {
    console.warn('[Startup] waitDesktopReady failed:', err)
  }
}

/** Fire-and-forget lazy route chunks during splash (no UI). */
export function prefetchLazyAppChunks(): void {
  void import('../components/CommandPalette')
  void import('../components/GlobalSearch')
  void import('../components/GraphView')
  void import('../templates/TemplateSelector')
}

/** List vault root during splash so the file tree is not empty on first paint. */
export async function preloadFileTreeDuringSplash(workspacePath: string): Promise<void> {
  if (!window.electronAPI || !workspacePath?.trim()) return

  try {
    const result = await window.electronAPI.listFiles(workspacePath)
    if (!result?.success || !result.files) return
    window.__METAMATES_STARTUP_FILE_TREE__ = { workspacePath, files: result.files }
    window.__METAMATES_STARTUP__ = {
      ...window.__METAMATES_STARTUP__,
      workspacePath,
      fileTreeReady: true,
    }
  } catch (err) {
    console.warn('[Startup] file tree preload during splash failed:', err)
  }
}

/**
 * Silent workspace warm-up during splash: init, sync, index, vault API.
 * ACP calls wait for desktop-ready; file/index work can start immediately.
 */
export async function preloadWorkspaceDuringSplash(
  workspacePath: string,
  settings: AppSettings,
): Promise<void> {
  if (!window.electronAPI || !workspacePath?.trim()) return

  const lang = settings.language?.startsWith('en') ? 'en' : 'zh'
  try {
    await window.electronAPI.initWorkspace(workspacePath, lang)
    markStartupWorkspaceInit(workspacePath)
  } catch (err) {
    console.warn('[Startup] initWorkspace during splash failed:', err)
  }

  try {
    await window.electronAPI.syncWorkspacePath(workspacePath)
  } catch (err) {
    console.warn('[Startup] syncWorkspacePath during splash failed:', err)
  }

  try {
    await workspaceIndexService.attachWorkspace(workspacePath)
    window.__METAMATES_STARTUP__ = {
      ...window.__METAMATES_STARTUP__,
      workspacePath,
      indexAttached: true,
    }
  } catch (err) {
    console.warn('[Startup] attachWorkspace during splash failed:', err)
  }

  if (settings.vaultApiEnabled) {
    try {
      const result = await window.electronAPI.vaultApi.start(
        workspacePath,
        settings.vaultApiPort || 17333,
        settings.calendarIcsPath,
        !!settings.vaultApiLanAccess,
      )
      if (result && !result.success) {
        console.warn('[Startup] VaultAPI auto-start failed:', result.error)
      }
    } catch (err) {
      console.warn('[Startup] VaultAPI start failed:', err)
    }
  }

  await waitForDesktopReady()
  try {
    await window.electronAPI.acp.setWorkspacePath(workspacePath)
  } catch (err) {
    console.warn('[Startup] acp.setWorkspacePath during splash failed:', err)
  }
}

/** Connect last-used Agent (settings.lastAgentBackend) and prefetch history during splash. */
export async function preloadAgentDuringSplash(preferredBackend?: string): Promise<void> {
  const backend = preferredBackend?.trim()
  if (!backend || !window.electronAPI?.acp) return

  await waitForDesktopReady()

  try {
    window.__METAMATES_STARTUP_BACKEND__ = backend
    await window.electronAPI.acp.selectBackend(backend)
  } catch (err) {
    console.warn('[Startup] selectBackend during splash failed:', err)
  }

  try {
    const result: ConversationHistoryResult | null | undefined =
      await window.electronAPI.acp.getConversationHistory(backend, { limit: SPLASH_HISTORY_LIMIT })
    if (result) {
      window.__METAMATES_STARTUP_HISTORY__ = {
        backend,
        messages: result.messages ?? [],
        total: result.total,
        hasMore: result.hasMore,
      }
    }
  } catch (err) {
    console.warn('[Startup] conversation history preload during splash failed:', err)
  }
}

/** @deprecated Use preloadAgentDuringSplash */
export async function connectPreferredAgentDuringSplash(preferredBackend?: string): Promise<void> {
  await preloadAgentDuringSplash(preferredBackend)
}
