/**
 * 2D knowledge graph canvas rendering — visual layer only (physics stays separate).
 */

export interface GraphCanvasNode {
  id: string
  name: string
  x: number
  y: number
  size: number
  color: string
  connections: string[]
  importance: number
}

export interface GraphCanvasLink {
  source: string
  target: string
  kind?: 'wiki' | 'semantic'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Subtle animated starfield + grid behind the graph. */
export function drawGraphBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  scale: number,
  time: number,
  isDark: boolean,
): void {
  const base = isDark ? '#0f0f1a' : '#f3f4f8'
  const vignette = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.72)
  vignette.addColorStop(0, isDark ? '#16162a' : '#fafbff')
  vignette.addColorStop(1, base)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  const pulse = 0.03 + Math.sin(time * 0.8) * 0.015
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.35, 0, width * 0.5, height * 0.35, width * 0.55)
  glow.addColorStop(0, isDark ? `rgba(124,58,237,${pulse})` : `rgba(99,102,241,${pulse * 0.6})`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  const gridStep = 48 * scale
  const ox = offsetX % gridStep
  const oy = offsetY % gridStep
  ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.06)' : 'rgba(100,116,139,0.1)'
  ctx.lineWidth = 1
  for (let x = ox - gridStep; x < width + gridStep; x += gridStep) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = oy - gridStep; y < height + gridStep; y += gridStep) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  const starCount = 28
  for (let i = 0; i < starCount; i++) {
    const sx = ((i * 97) % width + Math.sin(time * 0.3 + i) * 6 + width) % width
    const sy = ((i * 53) % height + Math.cos(time * 0.25 + i * 0.7) * 5 + height) % height
    const twinkle = 0.15 + Math.sin(time * 1.4 + i * 0.9) * 0.12
    ctx.fillStyle = isDark ? `rgba(167,139,250,${twinkle})` : `rgba(99,102,241,${twinkle * 0.7})`
    ctx.beginPath()
    ctx.arc(sx, sy, 1 + (i % 3) * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawGraphLink(
  ctx: CanvasRenderingContext2D,
  source: GraphCanvasNode,
  target: GraphCanvasNode,
  link: GraphCanvasLink,
  scale: number,
  time: number,
  isHighlighted: boolean,
  isSelected: boolean,
  isDimmed: boolean,
  isCrossCluster = false,
): void {
  const sx = source.x
  const sy = source.y
  const tx = target.x
  const ty = target.y
  const active = isHighlighted || isSelected

  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(tx, ty)

  if (active) {
    const grad = ctx.createLinearGradient(sx, sy, tx, ty)
    grad.addColorStop(0, '#7c3aed')
    grad.addColorStop(0.5, '#a78bfa')
    grad.addColorStop(1, '#6366f1')
    ctx.strokeStyle = grad
    ctx.lineWidth = 2.8 / scale
    ctx.setLineDash([])
    ctx.shadowColor = 'rgba(124,58,237,0.45)'
    ctx.shadowBlur = 8 / scale
  } else if (link.kind === 'semantic') {
    ctx.strokeStyle = isDimmed ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.5)'
    ctx.lineWidth = 1 / scale
    ctx.setLineDash([7 / scale, 5 / scale])
    ctx.lineDashOffset = -(time * 18) / scale
    ctx.shadowBlur = 0
  } else if (isCrossCluster) {
    ctx.strokeStyle = isDimmed ? 'rgba(148,163,184,0.04)' : 'rgba(167,139,250,0.22)'
    ctx.lineWidth = 1 / scale
    ctx.setLineDash([5 / scale, 9 / scale])
    ctx.lineDashOffset = -(time * 8) / scale
    ctx.shadowBlur = 0
  } else {
    ctx.strokeStyle = isDimmed ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.42)'
    ctx.lineWidth = 1.4 / scale
    ctx.setLineDash([])
    ctx.shadowBlur = 0
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.shadowBlur = 0

  if (link.kind === 'semantic') return

  const angle = Math.atan2(ty - sy, tx - sx)
  const midX = (sx + tx) / 2
  const midY = (sy + ty) / 2
  ctx.beginPath()
  ctx.moveTo(midX, midY)
  ctx.lineTo(midX - 7 * Math.cos(angle - Math.PI / 6), midY - 7 * Math.sin(angle - Math.PI / 6))
  ctx.moveTo(midX, midY)
  ctx.lineTo(midX - 7 * Math.cos(angle + Math.PI / 6), midY - 7 * Math.sin(angle + Math.PI / 6))
  ctx.strokeStyle = active ? '#a78bfa' : (isDimmed ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.42)')
  ctx.lineWidth = 1.6 / scale
  ctx.stroke()

  if (active || !isDimmed) {
    const tFlow = (time * 0.35 + (sx + sy) * 0.002) % 1
    const fx = sx + (tx - sx) * tFlow
    const fy = sy + (ty - sy) * tFlow
    const dotAlpha = active ? 0.85 : 0.35
    ctx.fillStyle = `rgba(167,139,250,${dotAlpha})`
    ctx.beginPath()
    ctx.arc(fx, fy, (active ? 3.5 : 2) / scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function fitViewportToNodes(
  nodes: GraphCanvasNode[],
  viewport: { width: number; height: number },
  padding = 56,
  focusNodeId?: string | null,
): { scale: number; offset: { x: number; y: number } } {
  if (nodes.length === 0 || viewport.width < 1 || viewport.height < 1) {
    return { scale: 1, offset: { x: 0, y: 0 } }
  }

  const focus = focusNodeId ? nodes.find((node) => node.id === focusNodeId) : null
  const valid = nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
  if (valid.length === 0) {
    return { scale: 1, offset: { x: 0, y: 0 } }
  }

  const anchorX = focus?.x ?? valid.reduce((sum, node) => sum + node.x, 0) / valid.length
  const anchorY = focus?.y ?? valid.reduce((sum, node) => sum + node.y, 0) / valid.length

  const withDistance = valid.map((node) => ({
    node,
    distance: Math.hypot(node.x - anchorX, node.y - anchorY),
  }))
  withDistance.sort((a, b) => a.distance - b.distance)
  const medianDistance = withDistance[Math.floor(withDistance.length / 2)].distance
  const maxDistance = Math.max(120, medianDistance * 2.8 + 72)

  const bboxNodes = withDistance
    .filter((entry) => entry.distance <= maxDistance)
    .map((entry) => entry.node)
  const layoutNodes = bboxNodes.length >= 2 ? bboxNodes : valid

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of layoutNodes) {
    const pad = node.size / 2 + 28
    minX = Math.min(minX, node.x - pad)
    minY = Math.min(minY, node.y - pad)
    maxX = Math.max(maxX, node.x + pad)
    maxY = Math.max(maxY, node.y + pad)
  }

  if (!Number.isFinite(minX)) {
    return { scale: 1, offset: { x: 0, y: 0 } }
  }

  const graphW = Math.max(maxX - minX, 80)
  const graphH = Math.max(maxY - minY, 80)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const compactGraph = layoutNodes.length <= 80
  const minScale = focusNodeId && compactGraph ? 0.55 : 0.2
  const maxScale = compactGraph ? 1.6 : 3

  let scale = Math.min(
    maxScale,
    Math.max(
      minScale,
      Math.min(
        (viewport.width - padding * 2) / graphW,
        (viewport.height - padding * 2) / graphH,
      ),
    ),
  )

  const centerTarget = focus ?? { x: cx, y: cy }
  const offset = {
    x: viewport.width / 2 - centerTarget.x * scale,
    y: viewport.height / 2 - centerTarget.y * scale,
  }

  return { scale, offset }
}

/** Reset invalid or runaway layout coordinates before fitting the viewport. */
export function sanitizeGraphNodePositions(nodes: GraphCanvasNode[]): void {
  nodes.forEach((node, index) => {
    const outOfRange =
      !Number.isFinite(node.x)
      || !Number.isFinite(node.y)
      || node.x < -2000
      || node.x > 4000
      || node.y < -2000
      || node.y > 4000
    if (!outOfRange) return
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2
    const radius = 90 + (index % 6) * 16
    node.x = 380 + Math.cos(angle) * radius
    node.y = 280 + Math.sin(angle) * radius
    const mutable = node as GraphCanvasNode & { vx?: number; vy?: number }
    mutable.vx = 0
    mutable.vy = 0
  })
}

export interface GraphCanvasClusterCenter {
  folder: string
  x: number
  y: number
  color: string
  label: string
}

function getNodeFolder(nodeId: string): string {
  return nodeId.replace(/\\/g, '/').split('/')[0] ?? 'other'
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 1) return [...points]
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: Array<{ x: number; y: number }> = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }

  const upper: Array<{ x: number; y: number }> = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function expandHullFromCentroid(
  hull: Array<{ x: number; y: number }>,
  padding: number,
): Array<{ x: number; y: number }> {
  if (hull.length === 0) return hull
  const cx = hull.reduce((sum, point) => sum + point.x, 0) / hull.length
  const cy = hull.reduce((sum, point) => sum + point.y, 0) / hull.length
  const avgRadius = hull.reduce((sum, point) => sum + Math.hypot(point.x - cx, point.y - cy), 0) / hull.length
  const factor = (avgRadius + padding) / Math.max(avgRadius, 1)
  return hull.map((point) => ({
    x: cx + (point.x - cx) * factor,
    y: cy + (point.y - cy) * factor,
  }))
}

/** Smooth closed curve through hull vertices (softer island silhouettes). */
function traceSmoothClosedHull(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
): void {
  const n = points.length
  if (n < 3) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }
  ctx.closePath()
}

function groupNodesByFolder(nodes: GraphCanvasNode[]): Map<string, GraphCanvasNode[]> {
  const byFolder = new Map<string, GraphCanvasNode[]>()
  for (const node of nodes) {
    const folder = getNodeFolder(node.id)
    if (!byFolder.has(folder)) byFolder.set(folder, [])
    byFolder.get(folder)!.push(node)
  }
  return byFolder
}

function hullSamplePoints(nodes: GraphCanvasNode[]): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (const node of nodes) {
    const r = node.size / 2 + 4
    points.push({ x: node.x, y: node.y })
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      points.push({ x: node.x + Math.cos(angle) * r, y: node.y + Math.sin(angle) * r })
    }
  }
  return points
}

/** Soft convex-hull islands (Gephi / Obsidian-style) — no dashed rings. */
export function drawGraphFolderIslands(
  ctx: CanvasRenderingContext2D,
  nodes: GraphCanvasNode[],
  centers: Map<string, GraphCanvasClusterCenter>,
  scale: number,
  isDark: boolean,
): void {
  if (centers.size === 0 || nodes.length === 0) return

  const byFolder = groupNodesByFolder(nodes)

  for (const center of centers.values()) {
    const folderNodes = byFolder.get(center.folder)
    if (!folderNodes?.length) continue

    let hull: Array<{ x: number; y: number }>
    if (folderNodes.length === 1) {
      const node = folderNodes[0]
      const r = node.size / 2 + 22
      hull = []
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2
        hull.push({ x: node.x + Math.cos(angle) * r, y: node.y + Math.sin(angle) * r })
      }
    } else {
      hull = expandHullFromCentroid(convexHull(hullSamplePoints(folderNodes)), 24)
    }

    if (hull.length < 3) continue

    const cx = hull.reduce((sum, point) => sum + point.x, 0) / hull.length
    const cy = hull.reduce((sum, point) => sum + point.y, 0) / hull.length
    let maxR = 0
    for (const point of hull) {
      maxR = Math.max(maxR, Math.hypot(point.x - cx, point.y - cy))
    }

    traceSmoothClosedHull(ctx, hull)

    const wash = ctx.createRadialGradient(cx, cy, maxR * 0.06, cx, cy, maxR * 1.12)
    wash.addColorStop(0, rgba(center.color, isDark ? 0.24 : 0.16))
    wash.addColorStop(0.55, rgba(center.color, isDark ? 0.1 : 0.07))
    wash.addColorStop(1, rgba(center.color, 0))
    ctx.fillStyle = wash
    ctx.fill()

    ctx.strokeStyle = rgba(center.color, isDark ? 0.28 : 0.22)
    ctx.lineWidth = 1.25 / scale
    ctx.setLineDash([])
    ctx.stroke()

    const label = center.label
    const fontSize = Math.max(10, 11 / scale + 9)
    ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`
    const textW = ctx.measureText(label).width
    const padX = 8
    const pillW = textW + padX * 2
    const pillH = fontSize + 8
    let minY = Infinity
    for (const point of hull) minY = Math.min(minY, point.y)
    const pillX = cx - pillW / 2
    const pillY = minY - pillH - 8

    ctx.fillStyle = rgba(center.color, isDark ? 0.82 : 0.88)
    pathRoundRect(ctx, pillX, pillY, pillW, pillH, 6)
    ctx.fill()

    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, cx, pillY + pillH / 2)

    const countLabel = String(folderNodes.length)
    const countFont = Math.max(10, fontSize - 1)
    ctx.font = `600 ${countFont}px "Segoe UI", system-ui, sans-serif`
    const countW = ctx.measureText(countLabel).width
    const countPadX = 10
    const countPadY = 4
    const countPillW = countW + countPadX * 2
    const countPillH = countFont + countPadY * 2
    ctx.fillStyle = isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.72)'
    pathRoundRect(ctx, cx - countPillW / 2, cy - countPillH / 2, countPillW, countPillH, countPillH / 2)
    ctx.fill()
    ctx.fillStyle = isDark ? 'rgba(248,250,252,0.9)' : 'rgba(30,41,59,0.88)'
    ctx.fillText(countLabel, cx, cy)
  }
}

/** Fit panorama view to folder cluster anchors (shows all islands at once). */
export function fitViewportToFolderClusters(
  centers: Map<string, GraphCanvasClusterCenter> | Iterable<GraphCanvasClusterCenter>,
  folderNodeCounts: Map<string, number>,
  viewport: { width: number; height: number },
  padding = 88,
): { scale: number; offset: { x: number; y: number } } {
  const entries = centers instanceof Map ? [...centers.values()] : [...centers]
  if (entries.length === 0 || viewport.width < 1 || viewport.height < 1) {
    return { scale: 1, offset: { x: 0, y: 0 } }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const center of entries) {
    const count = folderNodeCounts.get(center.folder) ?? 1
    const localRadius = Math.min(140, 28 + Math.sqrt(count) * 11) + 48
    minX = Math.min(minX, center.x - localRadius)
    minY = Math.min(minY, center.y - localRadius - 28)
    maxX = Math.max(maxX, center.x + localRadius)
    maxY = Math.max(maxY, center.y + localRadius)
  }

  const graphW = Math.max(maxX - minX, 120)
  const graphH = Math.max(maxY - minY, 120)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const scale = Math.min(
    1.15,
    Math.max(
      0.18,
      Math.min(
        (viewport.width - padding * 2) / graphW,
        (viewport.height - padding * 2) / graphH,
      ),
    ),
  )

  return {
    scale,
    offset: {
      x: viewport.width / 2 - cx * scale,
      y: viewport.height / 2 - cy * scale,
    },
  }
}

/** @deprecated Use drawGraphFolderIslands */
export function drawGraphClusterRegions(
  ctx: CanvasRenderingContext2D,
  nodes: GraphCanvasNode[],
  centers: Map<string, GraphCanvasClusterCenter>,
  scale: number,
  isDark: boolean,
): void {
  drawGraphFolderIslands(ctx, nodes, centers, scale, isDark)
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius)
    return
  }
  const r = Math.min(radius, width / 2, height / 2)
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

export function drawGraphNode(
  ctx: CanvasRenderingContext2D,
  node: GraphCanvasNode,
  scale: number,
  time: number,
  opts: {
    isHovered: boolean
    isSelected: boolean
    isConnected: boolean
    isDimmed: boolean
    isDark: boolean
    showLabel?: boolean
    reduceMotion?: boolean
    compact?: boolean
  },
): void {
  const { isHovered, isSelected, isConnected, isDimmed, isDark, showLabel = true, reduceMotion = false, compact = false } = opts
  const active = isHovered || isSelected
  const floatY = reduceMotion || active || compact
    ? 0
    : Math.sin(time * 1.1 + node.x * 0.02 + node.y * 0.015) * 2.2
  const x = node.x
  const y = node.y + floatY
  const baseR = compact ? Math.max(2.2, node.size * 0.38) : node.size / 2
  const pulse = compact
    ? 1
    : (active ? 1 + Math.sin(time * 3.2) * 0.08 : 1 + Math.sin(time * 0.9 + node.importance * 0.05) * 0.03)
  const r = baseR * pulse

  const alpha = isDimmed ? (compact ? 0.55 : 0.45) : (compact ? 0.82 : 1)

  if (compact && !active && !isConnected) {
    ctx.fillStyle = rgba(node.color, alpha)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  if (active || isConnected) {
    const glowR = r * (active ? 2.2 : 1.6)
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, glowR)
    glow.addColorStop(0, rgba(node.color, active ? 0.55 : 0.28))
    glow.addColorStop(1, rgba(node.color, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, glowR, 0, Math.PI * 2)
    ctx.fill()
  }

  if (active) {
    const ringR = r * (1.55 + Math.sin(time * 2.4) * 0.12)
    ctx.strokeStyle = rgba(node.color, 0.35 + Math.sin(time * 3) * 0.15)
    ctx.lineWidth = 2 / scale
    ctx.beginPath()
    ctx.arc(x, y, ringR, 0, Math.PI * 2)
    ctx.stroke()
  }

  const sphere = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  sphere.addColorStop(0, rgba(node.color, alpha))
  sphere.addColorStop(0.55, rgba(node.color, alpha * 0.92))
  sphere.addColorStop(1, rgba(node.color, alpha * 0.45))
  ctx.fillStyle = sphere
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = active
    ? 'rgba(255,255,255,0.65)'
    : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.15)')
  ctx.lineWidth = (active ? 2 : 1) / scale
  ctx.stroke()

  if (!showLabel && !active) return

  const label = node.name
  const fontSize = active ? 13 : 11
  ctx.font = `${active ? '600' : '500'} ${fontSize}px "Segoe UI", system-ui, sans-serif`
  const textW = ctx.measureText(label).width
  const padX = 6
  const padY = 3
  const pillW = textW + padX * 2
  const pillH = fontSize + padY * 2
  const pillX = x - pillW / 2
  const pillY = y + r + 6

  ctx.fillStyle = active
    ? (isDark ? 'rgba(124,58,237,0.88)' : 'rgba(99,102,241,0.9)')
    : (isDark ? 'rgba(15,15,26,0.75)' : 'rgba(255,255,255,0.88)')
  pathRoundRect(ctx, pillX, pillY, pillW, pillH, 6)
  ctx.fill()

  if (active) {
    pathRoundRect(ctx, pillX, pillY, pillW, pillH, 6)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1 / scale
    ctx.stroke()
  }

  ctx.fillStyle = active
    ? '#ffffff'
    : (isDimmed ? (isDark ? 'rgba(166,173,200,0.45)' : 'rgba(107,114,128,0.55)') : (isDark ? '#e2e8f0' : '#1f2937'))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, pillY + pillH / 2)
}
