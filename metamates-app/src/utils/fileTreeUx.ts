/**
 * Pinned file-tree UX contracts — see docs/UX_REGRESSION_GUARDRAILS.md (UX-08, UX-09).
 */

import type { Key } from 'react'
import { collectRequiredExpandKeys, treePathsEqual } from './fileTreeExpand'

/** Treat only explicit file leaves as openable; folders may omit isLeaf while lazy-loading. */
export function isTreeFolderNode(node: { isLeaf?: boolean }): boolean {
  return node.isLeaf !== true
}

/** After creating a file/folder, reload this directory (not workspace root only). */
export function getVaultCreateRefreshDir(parentPath: string): string {
  return parentPath
}

/** Folder keys that must stay expanded so a newly created item is visible. */
export function getVaultCreateRevealExpandKeys(
  createdPath: string,
  parentPath: string,
  workspacePath: string,
): string[] {
  const keys = new Set(collectRequiredExpandKeys([createdPath], workspacePath))
  keys.add(parentPath)
  return [...keys]
}

/** When workspace root is re-listed, re-attach children for expanded folders (parents first). */
export function getExpandedDirsToRehydrate(
  workspacePath: string,
  expandedDirs: Iterable<string>,
): string[] {
  return [...expandedDirs]
    .filter((dir) => !treePathsEqual(dir, workspacePath))
    .sort((a, b) => a.length - b.length)
}

/**
 * Immutably replace children on a folder node (case-insensitive path match).
 * Ant Design lazy trees need a new tree reference to re-render `.ant-tree-title` rows.
 */
/**
 * Re-list workspace root without discarding already-loaded subtree children.
 */
export function mergeRootTreeChildren<T extends { key: Key; children?: T[]; isLeaf?: boolean }>(
  previousRoots: T[],
  nextRoots: T[],
): T[] {
  return nextRoots.map((nextNode) => {
    if (nextNode.isLeaf) return nextNode
    const prevNode = previousRoots.find((node) => treePathsEqual(String(node.key), String(nextNode.key)))
    if (prevNode?.children?.length) {
      return { ...nextNode, children: prevNode.children, isLeaf: false } as T
    }
    return nextNode
  })
}

export function patchTreeNodeChildren<T extends { key: Key; children?: T[]; isLeaf?: boolean }>(
  nodes: T[],
  nodePath: string,
  children: T[],
): { tree: T[]; patched: boolean } {
  let patched = false

  const patch = (list: T[]): T[] =>
    list.map((node) => {
      if (treePathsEqual(String(node.key), nodePath)) {
        patched = true
        return { ...node, children, isLeaf: false } as T
      }
      if (node.children?.length) {
        const nextChildren = patch(node.children)
        if (nextChildren !== node.children) {
          return { ...node, children: nextChildren } as T
        }
      }
      return node
    })

  return { tree: patch(nodes), patched }
}

export function withoutLoadedTreeKey(loadedKeys: readonly (string | number)[], nodePath: string): (string | number)[] {
  return loadedKeys.filter((key) => !treePathsEqual(String(key), nodePath))
}

export function withLoadedTreeKey(loadedKeys: readonly (string | number)[], nodePath: string): (string | number)[] {
  if (loadedKeys.some((key) => treePathsEqual(String(key), nodePath))) return [...loadedKeys]
  return [...loadedKeys, nodePath]
}
