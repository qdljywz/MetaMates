/** Tool-call lifecycle statuses from ACP / session DB. */
export const TOOL_IN_PROGRESS_STATUSES = new Set([
  'in_progress',
  'pending',
  'streaming',
  'work',
])

export const TOOL_TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'error',
  'finish',
])

export function isToolCallInProgress(status?: string | null): boolean {
  if (!status) return false
  return TOOL_IN_PROGRESS_STATUSES.has(status)
}

export function isToolCallTerminal(status?: string | null): boolean {
  if (!status) return false
  return TOOL_TERMINAL_STATUSES.has(status)
}

export function mergeToolCallStatus(existing?: string, incoming?: string): string | undefined {
  if (existing && isToolCallTerminal(existing)) return existing
  if (incoming && isToolCallTerminal(incoming)) return incoming
  return incoming || existing
}

export function finalizeInProgressToolCalls<T extends { type?: string; status?: string }>(
  messages: T[],
): T[] {
  return messages.map((m) => {
    if (m.type !== 'tool-call' || !isToolCallInProgress(m.status)) return m
    return { ...m, status: 'completed' }
  })
}

/** DB history must not keep interrupted turns as live (no active stream on cold load). */
export function sanitizeStaleSessionMessages<T extends { type?: string; status?: string }>(
  messages: T[],
): T[] {
  return finalizeInProgressToolCalls(messages).map((m) => {
    if (m.type === 'agent' && m.status === 'streaming') {
      return { ...m, status: 'finish' }
    }
    if (m.type === 'thinking' && m.status === 'streaming') {
      return { ...m, status: 'finish' }
    }
    return m
  })
}

export function shortenPathForDisplay(path: string, maxLen = 40): string {
  const leaf = path.split(/[/\\]/).pop() || path
  if (leaf.length <= maxLen) return leaf
  return `${leaf.slice(0, maxLen - 1)}…`
}

const GENERIC_TOOL_TITLES = new Set(['read', 'tool', 'write', 'edit', 'search', 'execute'])

export function formatToolDisplayTitle(
  title?: string,
  filePath?: string,
  kindLabel?: string,
): string {
  const fallback = kindLabel || 'Tool'
  const bare = (title || '').trim()

  if (filePath) {
    const shortName = shortenPathForDisplay(filePath)
    if (!bare || GENERIC_TOOL_TITLES.has(bare.toLowerCase())) {
      return `${fallback} · ${shortName}`
    }
  }

  if (bare.length > 48) return shortenPathForDisplay(bare, 48)
  return bare || fallback
}
