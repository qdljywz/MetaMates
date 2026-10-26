/**
 * Whether AgentChatPanel can skip calling getConversationHistory.
 * Connect/error bubbles alone must not count as hydrated vault history.
 */
export function shouldSkipHistoryReload(options: {
  force?: boolean
  hydrated: boolean
  cachedCount: number
}): boolean {
  if (options.force) return false
  return options.hydrated && options.cachedCount > 0
}
