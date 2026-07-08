import { describe, expect, it } from 'vitest'
import { fitViewportToNodes } from './graphCanvas2D'

describe('graphCanvas2D', () => {
  it('fits nodes into viewport with padding', () => {
    const nodes = [
      { id: 'a', name: 'a', x: 100, y: 100, size: 20, color: '#000', connections: [], importance: 1 },
      { id: 'b', name: 'b', x: 300, y: 250, size: 20, color: '#000', connections: [], importance: 1 },
    ]
    const vp = fitViewportToNodes(nodes, { width: 800, height: 500 })
    expect(vp.scale).toBeGreaterThan(0)
    expect(Number.isFinite(vp.offset.x)).toBe(true)
    expect(Number.isFinite(vp.offset.y)).toBe(true)
  })

  it('returns defaults for empty viewport', () => {
    expect(fitViewportToNodes([], { width: 0, height: 0 })).toEqual({
      scale: 1,
      offset: { x: 0, y: 0 },
    })
  })

  it('centers on focus node when provided', () => {
    const nodes = [
      { id: 'a', name: 'a', x: 0, y: 0, size: 20, color: '#000', connections: [], importance: 1 },
      { id: 'b', name: 'b', x: 120, y: 80, size: 20, color: '#000', connections: [], importance: 1 },
    ]
    const vp = fitViewportToNodes(nodes, { width: 800, height: 500 }, 56, 'a')
    const focusScreenX = vp.offset.x + 0 * vp.scale
    const focusScreenY = vp.offset.y + 0 * vp.scale
    expect(Math.abs(focusScreenX - 400)).toBeLessThan(2)
    expect(Math.abs(focusScreenY - 250)).toBeLessThan(2)
  })
})
