/**
 * Helpers for revealing open files in the Ant Design file tree.
 */

import type { FileChangeEvent } from '../types/electron'

/**
 * Normalize path separators for stable comparison on Windows.
 */
export function normalizeTreePath(filePath: string): string {
  return filePath.replace(/\//g, '\\').replace(/\\+$/, '')
}

/**
 * Compare two paths case-insensitively (Windows vault paths).
 */
export function treePathsEqual(a: string, b: string): boolean {
  return normalizeTreePath(a).toLowerCase() === normalizeTreePath(b).toLowerCase()
}

/**
 * Which directory should be re-listed after a vault file change (create / delete / rename).
 */
export function getTreeRefreshParentDir(
  workspacePath: string,
  event?: Pick<FileChangeEvent, 'dirPath' | 'filename'>,
): string {
  if (!event?.dirPath) return workspacePath
  if (!event.filename) return event.dirPath
  const joined = `${normalizeTreePath(event.dirPath)}\\${event.filename.replace(/\//g, '\\')}`
  const parentEnd = Math.max(joined.lastIndexOf('\\'), joined.lastIndexOf('/'))
  if (parentEnd <= 0) return workspacePath
  return joined.slice(0, parentEnd)
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
