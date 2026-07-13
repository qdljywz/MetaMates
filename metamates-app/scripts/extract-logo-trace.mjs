/**
 * Extract outer silhouette from logo.png and emit SVG path data for StartupSplash.
 * Uses alpha threshold + Moore-neighbor contour tracing + Douglas-Peucker simplification.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const LOGO_PATH = path.join(ROOT, 'src/assets/logo.png')
const VIEWBOX = 128
const ALPHA_THRESHOLD = 128
const SIMPLIFY_EPSILON = 0.85

/** @param {boolean[][]} mask */
function findStart(mask) {
  for (let y = 0; y < mask.length; y++) {
    for (let x = 0; x < mask[0].length; x++) {
      if (mask[y][x]) return { x, y }
    }
  }
  throw new Error('No opaque pixels found')
}

/** Moore-neighbor outer contour (counter-clockwise). */
function traceOuterContour(mask) {
  const h = mask.length
  const w = mask[0].length
  const start = findStart(mask)
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ]

  const points = [{ x: start.x, y: start.y }]
  let px = start.x
  let py = start.y
  let backtrack = 7

  for (let guard = 0; guard < w * h * 8; guard++) {
    let found = false
    for (let i = 0; i < 8; i++) {
      const di = (backtrack + i) % 8
      const nx = px + dirs[di][0]
      const ny = py + dirs[di][1]
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (!mask[ny][nx]) continue
      px = nx
      py = ny
      backtrack = (di + 6) % 8
      if (px === start.x && py === start.y && points.length > 2) {
        return points
      }
      points.push({ x: px, y: py })
      found = true
      break
    }
    if (!found) break
  }
  return points
}

/** @param {{x:number,y:number}[]} pts */
function douglasPeucker(pts, epsilon) {
  if (pts.length <= 2) return pts

  const sqDist = (p, a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (dx === 0 && dy === 0) {
      const ex = p.x - a.x
      const ey = p.y - a.y
      return ex * ex + ey * ey
    }
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const ex = p.x - projX
    const ey = p.y - projY
    return ex * ex + ey * ey
  }

  let maxDist = 0
  let index = 0
  const end = pts.length - 1
  for (let i = 1; i < end; i++) {
    const d = sqDist(pts[i], pts[0], pts[end])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }

  if (maxDist > epsilon * epsilon) {
    const left = douglasPeucker(pts.slice(0, index + 1), epsilon)
    const right = douglasPeucker(pts.slice(index), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [pts[0], pts[end]]
}

/** @param {{x:number,y:number}[]} pts */
function pathLength(pts, closed = true) {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    len += Math.hypot(dx, dy)
  }
  if (closed && pts.length > 1) {
    const dx = pts[0].x - pts[pts.length - 1].x
    const dy = pts[0].y - pts[pts.length - 1].y
    len += Math.hypot(dx, dy)
  }
  return len
}

/** @param {{x:number,y:number}[]} pts */
function pointsToPath(pts, decimals = 1) {
  if (!pts.length) return ''
  const fmt = (n) => Number(n.toFixed(decimals)).toString()
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`
  }
  return `${d} Z`
}

async function main() {
  const { data, info } = await sharp(LOGO_PATH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const mask = Array.from({ length: info.height }, () => Array(info.width).fill(false))
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3]
      mask[y][x] = a >= ALPHA_THRESHOLD
    }
  }

  let raw = traceOuterContour(mask)
  console.error(`Raw contour points: ${raw.length}`)

  raw = douglasPeucker(raw, SIMPLIFY_EPSILON)
  console.error(`Simplified points: ${raw.length}`)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of raw) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const pad = 4
  const scale = (VIEWBOX - pad * 2) / Math.max(maxX - minX, maxY - minY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const normalized = raw.map((p) => ({
    x: VIEWBOX / 2 + (p.x - cx) * scale,
    y: VIEWBOX / 2 + (p.y - cy) * scale,
  }))

  const fullPath = pointsToPath(normalized)
  /** Open outline (no Z) — must match animateMotion path length, not closed loop. */
  const openLength = Math.ceil(pathLength(normalized, false))
  const closedLength = Math.ceil(pathLength(normalized, true))

  const previewSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="512" height="512">
  <rect width="100%" height="100%" fill="#18181b"/>
  <image href="../src/assets/logo.png" x="4" y="4" width="120" height="120" opacity="0.35"/>
  <path d="${fullPath}" fill="none" stroke="#ff8c28" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`

  const tsContent = `/** Auto-generated by scripts/extract-logo-trace.mjs — do not edit manually. */
export const LOGO_TRACE_VIEWBOX = ${VIEWBOX}
export const LOGO_TRACE_PATH_LENGTH = ${openLength}
/** Closed-loop length (open + closing segment); debug / preview only. */
export const LOGO_TRACE_PATH_LENGTH_CLOSED = ${closedLength}
/** Outer silhouette traced from src/assets/logo.png (alpha contour). */
export const LOGO_TRACE_OUTLINE =
  '${fullPath.replace(/ Z$/, '')}'

/** Splash cycle (s); trail-dot animateMotion + stroke-dash SMIL must share dur/keyTimes. */
export const STARTUP_SPLASH_CYCLE_S = 5
/** Fraction of cycle spent drawing the M outline (0–1); rest = hold + fade. */
export const STARTUP_SPLASH_DRAW_RATIO = 0.82
`

  const output = {
    viewBox: VIEWBOX,
    pointCount: normalized.length,
    pathLength: openLength,
    pathLengthClosed: closedLength,
    bounds: { minX, minY, maxX, maxY },
    LOGO_TRACE_OUTLINE: fullPath.replace(/ Z$/, ''),
    LOGO_TRACE_CLOSED: fullPath,
  }

  fs.writeFileSync(path.join(ROOT, 'src/assets/logo-trace.json'), JSON.stringify(output, null, 2))
  fs.writeFileSync(path.join(ROOT, 'src/constants/logoTrace.ts'), tsContent)
  fs.writeFileSync(path.join(ROOT, 'public/logo-trace-preview.svg'), previewSvg)
  console.log(JSON.stringify(output, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
