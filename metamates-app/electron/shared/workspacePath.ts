import * as path from 'path'

/**
 * Resolve a workspace path so Windows/Electron comparisons stay stable.
 * Empty or whitespace-only input stays empty (unbound workspace).
 */
export function normalizeWorkspacePath(workspacePath: string): string {
  if (!workspacePath?.trim()) return ''
  return path.resolve(workspacePath.trim())
}

/**
 * Comparison key for workspace paths. On Windows, drive letter and slash case
 * must not split the same vault into a second empty conversation.
 */
export function workspacePathKey(workspacePath: string): string {
  const normalized = normalizeWorkspacePath(workspacePath)
  if (!normalized) return ''
  if (process.platform === 'win32') {
    return normalized.replace(/\\/g, '/').toLowerCase()
  }
  return normalized
}

/** True when two paths refer to the same vault root. */
export function workspacePathsEqual(a: string, b: string): boolean {
  return workspacePathKey(a) === workspacePathKey(b)
}
