import type { AppSettings } from '../services/storage'

export interface CachedAgentInfo {
  backend: string
  name: string
  cliPath?: string
  acpArgs?: string[]
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

const STORAGE_KEY = 'metamates-storage'

function isAgentEnabled(backend: string, enabledMap?: Record<string, boolean>): boolean {
  if (!enabledMap || !(backend in enabledMap)) return true
  return enabledMap[backend] !== false
}

export function filterAgentsByEnabled<T extends { backend: string }>(
  agents: T[],
  enabledMap?: Record<string, boolean>,
): T[] {
  return agents.filter((a) => isAgentEnabled(a.backend, enabledMap))
}

/** Synchronous read for first paint — avoids empty-state flash on startup. */
export function readCachedAgentToolbarSync(): {
  agents: CachedAgentInfo[]
  lastBackend: string | null
} {
  if (typeof localStorage === 'undefined') {
    return { agents: [], lastBackend: null }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { agents: [], lastBackend: null }
    const data = JSON.parse(raw) as { settings?: AppSettings }
    const settings = data.settings
    if (!settings) return { agents: [], lastBackend: null }
    const agents = filterAgentsByEnabled(settings.cachedAgentToolbar || [], settings.cliAgentEnabled)
    const lastBackend = settings.lastAgentBackend || null
    const validLast =
      lastBackend && agents.some((a) => a.backend === lastBackend) ? lastBackend : agents[0]?.backend || null
    return { agents, lastBackend: validLast }
  } catch {
    return { agents: [], lastBackend: null }
  }
}

export function buildAgentToolbarCachePatch(
  agents: CachedAgentInfo[],
  lastBackend: string | null,
): Pick<AppSettings, 'cachedAgentToolbar' | 'lastAgentBackend'> {
  return {
    cachedAgentToolbar: agents.map((a) => ({
      backend: a.backend,
      name: a.name,
      cliPath: a.cliPath,
      acpArgs: a.acpArgs,
      logo: a.logo,
    })),
    lastAgentBackend: lastBackend || undefined,
  }
}
