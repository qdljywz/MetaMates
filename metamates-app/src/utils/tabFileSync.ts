import { treePathsEqual } from './fileTreeExpand'

export interface OpenTabRef {
  path: string
  name: string
}

function basenameLower(filePath: string): string {
  return filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
}

/** Tab paths that should close when a vault file is deleted from the tree. */
export function getTabPathsToCloseForDeletedFile(
  openTabs: readonly OpenTabRef[],
  deletedPath: string,
): string[] {
  const deletedName = basenameLower(deletedPath)
  const paths = new Set<string>()
  for (const tab of openTabs) {
    if (
      treePathsEqual(tab.path, deletedPath) ||
      (deletedName !== '' && tab.name.toLowerCase() === deletedName)
    ) {
      paths.add(tab.path)
    }
  }
  return [...paths]
}

export function getRenameTabPayload(
  openTabs: readonly OpenTabRef[],
  oldPath: string,
  newPath: string,
  newName: string,
): { oldPath: string; newPath: string; newName: string } | null {
  if (!openTabs.some((tab) => treePathsEqual(tab.path, oldPath))) return null
  return { oldPath, newPath, newName }
}
