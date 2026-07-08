import { describe, expect, it } from 'vitest'
import {
  collectFocusNeighborhood,
  filterLinksForDisplay,
  getGraphNodeColor,
  isOrphanGraphNode,
  collectActivityNeighborhood,
  layoutGraphCluster,
} from './graphFocus'

describe('graphFocus', () => {
  it('assigns folder colors by top-level path segment', () => {
    expect(getGraphNodeColor('01_日记与计划/2026-06-30')).toBe('#f97316')
    expect(getGraphNodeColor('02_项目与知识/智脉先锋/概览')).toBe('#3b82f6')
    expect(getGraphNodeColor('unknown/foo')).toBe('#64748b')
  })

  it('collects 2-hop wiki neighborhood', () => {
    const links = [
      { source: 'a', target: 'b', kind: 'wiki' as const },
      { source: 'b', target: 'c', kind: 'wiki' as const },
      { source: 'c', target: 'd', kind: 'wiki' as const },
      { source: 'a', target: 'x', kind: 'semantic' as const },
    ]
    const hood = collectFocusNeighborhood('a', links, 2)
    expect(hood.has('a')).toBe(true)
    expect(hood.has('b')).toBe(true)
    expect(hood.has('c')).toBe(true)
    expect(hood.has('d')).toBe(false)
    expect(hood.has('x')).toBe(false)
  })

  it('shows semantic edges only for active node unless show all', () => {
    const links = [
      { source: 'a', target: 'b', kind: 'wiki' as const },
      { source: 'a', target: 'c', kind: 'semantic' as const },
      { source: 'b', target: 'd', kind: 'semantic' as const },
    ]
    expect(filterLinksForDisplay(links, false, null).length).toBe(1)
    expect(filterLinksForDisplay(links, false, 'a').length).toBe(2)
    expect(filterLinksForDisplay(links, true, null).length).toBe(3)
  })

  it('detects orphan nodes with no wiki links', () => {
    expect(isOrphanGraphNode({ inDegree: 0, outDegree: 0 })).toBe(true)
    expect(isOrphanGraphNode({ inDegree: 1, outDegree: 0 })).toBe(false)
  })

  it('expands activity day files by one wiki hop', () => {
    const links = [
      { source: '01/a', target: '02/b', kind: 'wiki' as const },
      { source: '02/b', target: '02/c', kind: 'wiki' as const },
    ]
    const hood = collectActivityNeighborhood('/vault', ['/vault/01/a.md'], links)
    expect(hood.has('01/a')).toBe(true)
    expect(hood.has('02/b')).toBe(true)
    expect(hood.has('02/c')).toBe(false)
  })

  it('lays out focus cluster in a compact circle', () => {
    const nodes = [
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 900, y: 800 },
      { id: 'c', x: -400, y: 1200 },
    ]
    layoutGraphCluster(nodes, 'a', { x: 0, y: 0 })
    expect(nodes[0].x).toBe(0)
    expect(nodes[0].y).toBe(0)
    const distB = Math.hypot(nodes[1].x, nodes[1].y)
    const distC = Math.hypot(nodes[2].x, nodes[2].y)
    expect(distB).toBeGreaterThan(40)
    expect(distC).toBeGreaterThan(40)
    expect(distB).toBeLessThan(320)
    expect(distC).toBeLessThan(320)
  })
})
