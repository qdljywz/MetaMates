/** Whether a CLI backend is enabled for in-app Agent use (default: enabled). */
export function isCliAgentEnabled(
  backend: string,
  settings: Record<string, unknown> | null | undefined,
): boolean {
  const map = settings?.cliAgentEnabled as Record<string, boolean> | undefined
  if (!map || !(backend in map)) return true
  return map[backend] !== false
}

export function filterEnabledCliAgents<T extends { backend: string }>(
  agents: T[],
  settings: Record<string, unknown> | null | undefined,
): T[] {
  return agents.filter((agent) => isCliAgentEnabled(agent.backend, settings))
}
