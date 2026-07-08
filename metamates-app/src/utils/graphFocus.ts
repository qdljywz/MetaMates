/**
 * Knowledge graph focus mode, folder colors, and semantic edge visibility.
 */

import type { WorkspaceLanguage } from '../constants/paths'
import { WORKSPACE_LAYOUT } from '../constants/paths'
import { getVaultNodeKey } from '../services/vaultPaths'

export type GraphLinkLike = { source: string; target: string; kind?: 'wiki' | 'semantic' }

const FOLDER_COLOR_MAP: Record<string, string> = {
  [WORKSPACE_LAYOUT.zh.LOG_AND_PLAN]: '#f97316',
  [WORKSPACE_LAYOUT.en.LOG_AND_PLAN]: '#f97316',
  [WORKSPACE_LAYOUT.zh.PROJECTS]: '#3b82f6',
  [WORKSPACE_LAYOUT.en.PROJECTS]: '#3b82f6',
  [WORKSPACE_LAYOUT.zh.INSIGHTS]: '#22c55e',
  [WORKSPACE_LAYOUT.en.INSIGHTS]: '#22c55e',
  [WORKSPACE_LAYOUT.zh.INTELLIGENCE]: '#a855f7',
  [WORKSPACE_LAYOUT.en.INTELLIGENCE]: '#a855f7',
  [WORKSPACE_LAYOUT.zh.TEMPLATES]: '#94a3b8',
  [WORKSPACE_LAYOUT.en.TEMPLATES]: '#94a3b8',
}

const DEFAULT_NODE_COLOR = '#64748b'

/** Node color from top-level vault folder (01_… / 02_…). */
export function getGraphNodeColor(nodeId: string, _language?: WorkspaceLanguage): string {
  const top = nodeId.replace(/\\/g, '/').split('/')[0]
  return FOLDER_COLOR_MAP[top] ?? DEFAULT_NODE_COLOR
}

export function getGraphFolderLegend(language: WorkspaceLanguage = 'zh'): Array<{ label: string; color: string }> {
  const layout = WORKSPACE_LAYOUT[language]
  return [
    { label: layout.LOG_AND_PLAN, color: FOLDER_COLOR_MAP[layout.LOG_AND_PLAN] },
    { label: layout.PROJECTS, color: FOLDER_COLOR_MAP[layout.PROJECTS] },
    { label: layout.INSIGHTS, color: FOLDER_COLOR_MAP[layout.INSIGHTS] },
    { label: layout.INTELLIGENCE, color: FOLDER_COLOR_MAP[layout.INTELLIGENCE] },
    { label: layout.TEMPLATES, color: FOLDER_COLOR_MAP[layout.TEMPLATES] },
  ]
}

/**
 * Collect node ids within N hops of focus (wiki edges only for traversal).
 */
export function collectFocusNeighborhood(
  focusNodeId: string,
  links: GraphLinkLike[],
  maxDepth = 2,
): Set<string> {
  const adjacency = new Map<string, Set<string>>()

  for (const link of links) {
    if (link.kind === 'semantic') continue
    if (!adjacency.has(link.source)) adjacency.set(link.source, new Set())
    if (!adjacency.has(link.target)) adjacency.set(link.target, new Set())
    adjacency.get(link.source)!.add(link.target)
    adjacency.get(link.target)!.add(link.source)
  }

  const visited = new Set<string>([focusNodeId])
  let frontier = [focusNodeId]

  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          next.push(neighbor)
        }
      }
    }
    frontier = next
  }

  return visited
}

export type GraphViewMode = 'focus' | 'full' | 'orphans' | 'activity'

export function isOrphanGraphNode(node: { inDegree: number; outDegree: number }): boolean {
  return node.inDegree === 0 && node.outDegree === 0
}

/**
 * Expand activity-day file paths to include 1-hop wiki neighbors.
 */
export function collectActivityNeighborhood(
  workspacePath: string,
  filePaths: string[],
  links: GraphLinkLike[],
): Set<string> {
  const seeds = new Set(filePaths.map((filePath) => getVaultNodeKey(workspacePath, filePath)))
  const ids = new Set(seeds)

  for (const link of links) {
    if (link.kind === 'semantic') continue
    if (seeds.has(link.source)) ids.add(link.target)
    if (seeds.has(link.target)) ids.add(link.source)
  }
  return ids
}

/** Semantic edges: all when toggled on, otherwise only edges touching the active node. */
export function filterLinksForDisplay(
  links: GraphLinkLike[],
  showAllSemantic: boolean,
  activeNodeId?: string | null,
): GraphLinkLike[] {
  if (showAllSemantic) return links
  return links.filter((link) => {
    if (link.kind !== 'semantic') return true
    if (!activeNodeId) return false
    return link.source === activeNodeId || link.target === activeNodeId
  })
}

export function filterLinksToNodeSet(links: GraphLinkLike[], nodeIds: Set<string>): GraphLinkLike[] {
  return links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
}

export interface GraphLayoutNode {
  id: string
  x: number
  y: number
  vx?: number
  vy?: number
}

/** Compact circular layout for focus / activity subgraphs (world origin = cluster center). */
export function layoutGraphCluster(
  nodes: GraphLayoutNode[],
  anchorId?: string | null,
  center = { x: 0, y: 0 },
): void {
  if (nodes.length === 0) return

  const anchor = (anchorId ? nodes.find((node) => node.id === anchorId) : null) ?? nodes[0]
  anchor.x = center.x
  anchor.y = center.y
  anchor.vx = 0
  anchor.vy = 0

  const others = nodes.filter((node) => node.id !== anchor.id)
  const radius = Math.min(280, 60 + others.length * 14)

  others.forEach((node, index) => {
    const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2
    node.x = center.x + Math.cos(angle) * radius
    node.y = center.y + Math.sin(angle) * radius
    node.vx = 0
    node.vy = 0
  })
}
