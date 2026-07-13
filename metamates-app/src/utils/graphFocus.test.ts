import { describe, expect, it } from 'vitest'
import {
  collectFocusNeighborhood,
  computeFolderClusterCenters,
  computeGraph3DNodePositions,
  filterLinksForDisplay,
  getGraphNodeColor,
  getGraphNodeFolder,
  isOrphanGraphNode,
  collectActivityNeighborhood,
  layoutGraphCluster,
  layoutGraphFolderClusters,
  measureFolderClusterSeparation,
  usesGraphFolderIslandLayout,
} from './graphFocus'

describe('graphFocus', () => {
  it('assigns folder colors by top-level path segment', () => {
    expect(getGraphNodeColor('01_日记与计划/2026-06-30')).toBe('#f97316')
    expect(getGraphNodeColor('02_项目与知识/智脉先锋/概览')).toBe('#00b4a6')
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

  it('uses folder islands only in full panorama mode', () => {
    expect(usesGraphFolderIslandLayout('full')).toBe(true)
    expect(usesGraphFolderIslandLayout('focus')).toBe(false)
    expect(usesGraphFolderIslandLayout('orphans')).toBe(false)
    expect(usesGraphFolderIslandLayout('activity')).toBe(false)
  })

  it('groups folder clusters around separate anchors', () => {
    const nodes = [
      { id: '01_日记与计划/a', x: 0, y: 0 },
      { id: '01_日记与计划/b', x: 0, y: 0 },
      { id: '02_项目与知识/c', x: 0, y: 0 },
    ]
    const centers = layoutGraphFolderClusters(nodes, 'zh', 300)
    expect(centers.size).toBeGreaterThanOrEqual(2)
    expect(getGraphNodeFolder('01_日记与计划/a')).toBe('01_日记与计划')
    const logCenter = centers.get('01_日记与计划')
    const projectCenter = centers.get('02_项目与知识')
    expect(logCenter).toBeTruthy()
    expect(projectCenter).toBeTruthy()
    expect(Math.hypot(logCenter!.x - projectCenter!.x, logCenter!.y - projectCenter!.y)).toBeGreaterThan(200)
    expect(Math.hypot(nodes[0].x - logCenter!.x, nodes[0].y - logCenter!.y)).toBeLessThan(180)
    expect(Math.hypot(nodes[2].x - projectCenter!.x, nodes[2].y - projectCenter!.y)).toBeLessThan(180)
  })

  it('builds 3D folder cluster positions', () => {
    const nodes = [
      { id: '01_日记与计划/a' },
      { id: '02_项目与知识/b' },
    ]
    const sphere = computeGraph3DNodePositions(nodes, 'zh', 'sphere')
    const folders = computeGraph3DNodePositions(nodes, 'zh', 'folders')
    expect(sphere.size).toBe(2)
    expect(folders.size).toBe(2)
    const a = folders.get('01_日记与计划/a')!
    const b = folders.get('02_项目与知识/b')!
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(120)
  })

  it('keeps folder clusters spatially separated after layout', () => {
    const nodes = [
      { id: '01_日记与计划/a', x: 0, y: 0 },
      { id: '01_日记与计划/b', x: 0, y: 0 },
      { id: '02_项目与知识/c', x: 0, y: 0 },
      { id: '03_点滴积累/d', x: 0, y: 0 },
      { id: '04_情报与连接/e', x: 0, y: 0 },
    ]
    layoutGraphFolderClusters(nodes, 'zh')
    expect(measureFolderClusterSeparation(nodes)).toBeGreaterThan(180)
  })

  it('survives dense cross-folder links without collapsing clusters', () => {
    const folders = [
      '01_日记与计划',
      '02_项目与知识',
      '03_点滴积累',
      '04_情报与连接',
      '05_模板与配置',
    ]
    const nodes: Array<{ id: string; x: number; y: number; vx: number; vy: number }> = []
    const links: Array<{ source: string; target: string; kind: 'wiki' }> = []

    for (const folder of folders) {
      for (let i = 0; i < 12; i++) {
        nodes.push({ id: `${folder}/note-${i}`, x: 0, y: 0, vx: 0, vy: 0 })
      }
    }

    for (const node of nodes) {
      const folder = getGraphNodeFolder(node.id)
      const sameFolder = nodes.filter((n) => getGraphNodeFolder(n.id) === folder && n.id !== node.id)
      links.push({ source: node.id, target: sameFolder[0].id, kind: 'wiki' })
      const otherFolder = folders[(folders.indexOf(folder) + 1) % folders.length]
      links.push({ source: node.id, target: `${otherFolder}/note-0`, kind: 'wiki' })
    }

    const centers = layoutGraphFolderClusters(nodes, 'zh')
    expect(measureFolderClusterSeparation(nodes)).toBeGreaterThan(180)

    for (let frame = 0; frame < 200; frame++) {
      for (const node of nodes) {
        let fx = 0
        let fy = 0
        const nodeFolder = getGraphNodeFolder(node.id)

        for (const other of nodes) {
          if (other.id === node.id) continue
          if (getGraphNodeFolder(other.id) !== nodeFolder) continue
          const dx = node.x - other.x
          const dy = node.y - other.y
          const dist = Math.max(Math.hypot(dx, dy), 36)
          const force = 520 / (dist * dist)
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        for (const link of links) {
          const cross = getGraphNodeFolder(link.source) !== getGraphNodeFolder(link.target)
          if (cross) continue
          if (link.source !== node.id && link.target !== node.id) continue
          const otherId = link.source === node.id ? link.target : link.source
          const other = nodes.find((n) => n.id === otherId)
          if (!other) continue
          const dx = other.x - node.x
          const dy = other.y - node.y
          const dist = Math.max(Math.hypot(dx, dy), 1)
          const force = (dist - 96) * 0.014
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        const cluster = centers.get(nodeFolder)
        if (cluster) {
          fx += (cluster.x - node.x) * 0.028
          fy += (cluster.y - node.y) * 0.028
        }

        node.vx = (node.vx + fx) * 0.86
        node.vy = (node.vy + fy) * 0.86
        node.x += node.vx
        node.y += node.vy
      }
    }

    expect(measureFolderClusterSeparation(nodes)).toBeGreaterThan(150)
  }, 15_000)
})
