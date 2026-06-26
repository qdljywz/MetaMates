/** Default ACP permission mode — auto-approve tool/file operations without prompts. */
export const DEFAULT_AGENT_MODE = 'yolo'

export function normalizeAgentMode(mode?: string | null): string {
  if (!mode || mode === 'default') return DEFAULT_AGENT_MODE
  return mode
}

export function isAutoApproveMode(mode?: string | null): boolean {
  const normalized = normalizeAgentMode(mode)
  return normalized === 'yolo' || normalized === 'bypassPermissions'
}
