/**
 * Helpers for revealing open files in the Ant Design file tree.
 */

/**
 * Normalize path separators for stable comparison on Windows.
 */
export function normalizeTreePath(filePath: string): string {
  return filePath.replace(/\//g, '\\').replace(/\\+$/, '')
}

/**
 * Return ancestor directory keys from workspace root down to the file's parent folder.
 * Does not include the workspace root or the file itself.
 */
export function getDirectoryAncestors(filePath: string, workspacePath: string): string[] {
  const normalizedFile = normalizeTreePath(filePath)
  const normalizedWorkspace = normalizeTreePath(workspacePath)
  if (!normalizedFile || !normalizedWorkspace) return []

  const fileLower = normalizedFile.toLowerCase()
  const workspaceLower = normalizedWorkspace.toLowerCase()
  if (!fileLower.startsWith(workspaceLower)) return []

  const ancestors: string[] = []
  let current = normalizedFile
  const parentOfFile = current.slice(0, Math.max(current.lastIndexOf('\\'), current.lastIndexOf('/')))

  current = parentOfFile
  while (current.length > normalizedWorkspace.length) {
    ancestors.unshift(current)
    const cut = Math.max(current.lastIndexOf('\\'), current.lastIndexOf('/'))
    if (cut <= 0) break
    current = current.slice(0, cut)
  }

  return ancestors
}

/**
 * Collect all folder keys that must stay expanded for the given open file paths.
 */
export function collectRequiredExpandKeys(filePaths: readonly string[], workspacePath: string): string[] {
  const keys = new Set<string>()
  for (const filePath of filePaths) {
    for (const dir of getDirectoryAncestors(filePath, workspacePath)) {
      keys.add(dir)
    }
  }
  return [...keys]
}
