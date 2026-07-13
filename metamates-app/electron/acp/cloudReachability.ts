/**
 * Lightweight cloud API reachability for backends that require external network.
 * "Connected" in the UI must not imply cloud access when only the local CLI is up.
 */

import { net } from 'electron'

export const CLOUD_DEPENDENT_BACKENDS = new Set(['gemini', 'claude', 'codex'])

const PROBE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/',
  claude: 'https://api.anthropic.com/',
  codex: 'https://api.openai.com/',
}

export const CLOUD_OFFLINE_ERROR = '无法连接云端 API（请检查外网、代理或防火墙）'

const CACHE_TTL_MS = 20_000
const PROBE_TIMEOUT_MS = 4_000

const cache = new Map<string, { ok: boolean; at: number }>()

export function invalidateCloudReachability(backend?: string): void {
  if (backend) {
    cache.delete(backend)
    return
  }
  cache.clear()
}

export function isCloudDependentBackend(backend: string): boolean {
  return CLOUD_DEPENDENT_BACKENDS.has(backend)
}

/** @internal test hook */
export function setCloudReachabilityCache(backend: string, ok: boolean): void {
  cache.set(backend, { ok, at: Date.now() })
}

export async function isCloudReachable(backend: string, probeUrlOverride?: string): Promise<boolean> {
  const url = probeUrlOverride?.trim() || PROBE_URLS[backend]
  if (!url) return true

  const cacheKey = probeUrlOverride ? `${backend}:${url}` : backend

  if (!net.isOnline()) {
    cache.set(cacheKey, { ok: false, at: Date.now() })
    return false
  }

  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.ok
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    // Any HTTP response means the route to the cloud is reachable (401/404 is fine).
    const ok = typeof res.status === 'number' && res.status > 0
    cache.set(cacheKey, { ok, at: Date.now() })
    return ok
  } catch {
    cache.set(cacheKey, { ok: false, at: Date.now() })
    return false
  }
}
