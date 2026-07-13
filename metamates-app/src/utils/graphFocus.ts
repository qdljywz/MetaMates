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
  [WORKSPACE_LAYOUT.zh.PROJECTS]: '#00b4a6',
  [WORKSPACE_LAYOUT.en.PROJECTS]: '#00b4a6',
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

/** Panorama view lays out notes as folder-colored islands (not a separate mode). */
export function usesGraphFolderIslandLayout(mode: GraphViewMode): boolean {
  return mode === 'full'
}

export interface FolderClusterCenter {
  folder: string
  x: number
  y: number
  color: string
  label: string
}

/** Top-level vault folder segment (01_… / 02_…). */
export function getGraphNodeFolder(nodeId: string): string {
  return nodeId.replace(/\\/g, '/').split('/')[0] ?? 'other'
}

/** Pentagonal (or smaller) layout of folder cluster anchors. */
export function computeFolderClusterCenters(
  nodes: Array<{ id: string }>,
  language: WorkspaceLanguage = 'zh',
  spread = 420,
): Map<string, FolderClusterCenter> {
  const layout = WORKSPACE_LAYOUT[language]
  const folderOrder = [
    layout.LOG_AND_PLAN,
    layout.PROJECTS,
    layout.INSIGHTS,
    layout.INTELLIGENCE,
    layout.TEMPLATES,
  ]

  const counts = new Map<string, number>()
  for (const node of nodes) {
    const folder = getGraphNodeFolder(node.id)
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }

  const activeFolders = folderOrder.filter((folder) => (counts.get(folder) ?? 0) > 0)
  const folderOrderSet = new Set<string>(folderOrder)
  const unknownFolders = [...counts.keys()].filter((folder) => !folderOrderSet.has(folder))
  const ordered = [...activeFolders, ...unknownFolders]
  const result = new Map<string, FolderClusterCenter>()

  ordered.forEach((folder, index) => {
    const angle = (index / Math.max(ordered.length, 1)) * Math.PI * 2 - Math.PI / 2
    const ring = ordered.length <= 1 ? 0 : spread * (ordered.length <= 5 ? 0.68 : 0.92)
    result.set(folder, {
      folder,
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      color: FOLDER_COLOR_MAP[folder] ?? DEFAULT_NODE_COLOR,
      label: folder.split('_').pop() ?? folder,
    })
  })

  return result
}

/** Seed nodes around their folder cluster center (compact local circle). */
export function layoutGraphFolderClusters(
  nodes: GraphLayoutNode[],
  language: WorkspaceLanguage = 'zh',
  spread?: number,
): Map<string, FolderClusterCenter> {
  const byFolder = new Map<string, GraphLayoutNode[]>()

  for (const node of nodes) {
    const folder = getGraphNodeFolder(node.id)
    if (!byFolder.has(folder)) byFolder.set(folder, [])
    byFolder.get(folder)!.push(node)
  }

  const maxLocalRadius = Math.max(
    56,
    ...[...byFolder.values()].map((group) =>
      Math.min(140, 28 + Math.sqrt(group.length) * 11),
    ),
  )
  const clusterSpread = spread ?? Math.max(300, maxLocalRadius * 2.15 + Math.cbrt(nodes.length) * 28)
  const centers = computeFolderClusterCenters(nodes, language, clusterSpread)

  const golden = Math.PI * (3 - Math.sqrt(5))
  for (const [folder, group] of byFolder) {
    const center = centers.get(folder) ?? { x: 0, y: 0, folder, color: DEFAULT_NODE_COLOR, label: folder }
    const localRadius = Math.min(140, 28 + Math.sqrt(group.length) * 11)
    const step = Math.max(5.5, localRadius / Math.sqrt(Math.max(group.length, 1)))
    group.forEach((node, index) => {
      const ring = step * Math.sqrt(index + 1)
      const angle = index * golden
      node.x = center.x + Math.cos(angle) * ring
      node.y = center.y + Math.sin(angle) * ring
      node.vx = 0
      node.vy = 0
    })
  }

  return centers
}

/** Min pairwise distance between folder centroids — audit metric for cluster mode. */
export function measureFolderClusterSeparation(
  nodes: Array<{ id: string; x: number; y: number }>,
): number {
  const sums = new Map<string, { x: number; y: number; count: number }>()
  for (const node of nodes) {
    const folder = getGraphNodeFolder(node.id)
    const entry = sums.get(folder) ?? { x: 0, y: 0, count: 0 }
    entry.x += node.x
    entry.y += node.y
    entry.count += 1
    sums.set(folder, entry)
  }

  const centroids = [...sums.values()].map((entry) => ({
    x: entry.x / entry.count,
    y: entry.y / entry.count,
  }))
  if (centroids.length < 2) return Number.POSITIVE_INFINITY

  let minDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      minDist = Math.min(
        minDist,
        Math.hypot(centroids[i].x - centroids[j].x, centroids[i].y - centroids[j].y),
      )
    }
  }
  return minDist
}

export function isCrossFolderGraphLink(sourceId: string, targetId: string): boolean {
  return getGraphNodeFolder(sourceId) !== getGraphNodeFolder(targetId)
}

export type Graph3DLayoutMode = 'sphere' | 'folders'

export interface Graph3DPosition {
  x: number
  y: number
  z: number
}

/** Place nodes on a sphere or in folder-colored 3D clusters. */
export function computeGraph3DNodePositions(
  nodes: Array<{ id: string }>,
  language: WorkspaceLanguage = 'zh',
  layoutMode: Graph3DLayoutMode = 'sphere',
): Map<string, Graph3DPosition> {
  const positions = new Map<string, Graph3DPosition>()
  if (nodes.length === 0) return positions

  if (layoutMode === 'sphere') {
    nodes.forEach((node, index) => {
      const phi = Math.acos(-1 + (2 * index) / nodes.length)
      const theta = Math.sqrt(nodes.length * Math.PI) * phi
      const radius = 200
      positions.set(node.id, {
        x: radius * Math.cos(theta) * Math.sin(phi),
        y: radius * Math.sin(theta) * Math.sin(phi),
        z: radius * Math.cos(phi),
      })
    })
    return positions
  }

  const layoutNodes: GraphLayoutNode[] = nodes.map((node) => ({ id: node.id, x: 0, y: 0 }))
  const centers = layoutGraphFolderClusters(layoutNodes, language, 240)
  const byFolder = new Map<string, string[]>()

  for (const node of nodes) {
    const folder = getGraphNodeFolder(node.id)
    if (!byFolder.has(folder)) byFolder.set(folder, [])
    byFolder.get(folder)!.push(node.id)
  }

  let folderIndex = 0
  for (const [folder, ids] of byFolder) {
    const center = centers.get(folder) ?? { x: 0, y: 0, folder, color: DEFAULT_NODE_COLOR, label: folder }
    const zBase = (folderIndex - (byFolder.size - 1) / 2) * 42
    folderIndex += 1

    ids.forEach((id, index) => {
      const phi = Math.acos(-1 + (2 * index) / ids.length)
      const theta = Math.sqrt(ids.length * Math.PI) * phi
      const radius = Math.min(78, 26 + ids.length * 5)
      positions.set(id, {
        x: center.x + radius * Math.cos(theta) * Math.sin(phi),
        y: center.y + radius * Math.sin(theta) * Math.sin(phi),
        z: zBase + radius * Math.cos(phi) * 0.5,
      })
    })
  }

  return positions
}

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
