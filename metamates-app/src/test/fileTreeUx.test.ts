import { describe, expect, it } from 'vitest'
import {
  getExpandedDirsToRehydrate,
  getVaultCreateRefreshDir,
  getVaultCreateRevealExpandKeys,
  patchTreeNodeChildren,
  withLoadedTreeKey,
  withoutLoadedTreeKey,
} from '../utils/fileTreeUx'

const WS = 'C:\\MetaMatesVault\\test-fixture'

describe('fileTreeUx (pinned)', () => {
  it('UX-08: refresh parent dir after create, not workspace root', () => {
    const parent = `${WS}\\02_projects\\sub`
    expect(getVaultCreateRefreshDir(parent)).toBe(parent)
  })

  it('UX-08: reveal expand keys include parent and ancestors', () => {
    const created = `${WS}\\02_projects\\sub\\note.md`
    const parent = `${WS}\\02_projects\\sub`
    const keys = getVaultCreateRevealExpandKeys(created, parent, WS)
    expect(keys).toContain(parent)
    expect(keys).toContain(`${WS}\\02_projects`)
  })

  it('UX-09: rehydrate expanded dirs shallow-to-deep', () => {
    const deep = `${WS}\\02_projects\\sub`
    const mid = `${WS}\\02_projects`
    const dirs = getExpandedDirsToRehydrate(WS, [deep, mid, WS])
    expect(dirs).toEqual([mid, deep])
  })

  it('UX-08: patchTreeNodeChildren updates nested folder children', () => {
    const parent = `${WS}\\02_projects\\sandbox`
    const tree = [
      {
        key: `${WS}\\02_projects`,
        children: [{ key: parent, isLeaf: false, children: [{ key: `${parent}\\old.md`, title: 'old.md', isLeaf: true }] }],
      },
    ]
    const nextChildren = [
      { key: `${parent}\\old.md`, title: 'old.md', isLeaf: true },
      { key: `${parent}\\new.md`, title: 'new.md', isLeaf: true },
    ]
    const { tree: patched, patched: ok } = patchTreeNodeChildren(
      tree as Parameters<typeof patchTreeNodeChildren>[0],
      parent,
      nextChildren as Parameters<typeof patchTreeNodeChildren>[2],
    )
    expect(ok).toBe(true)
    expect(patched[0].children?.[0].children).toHaveLength(2)
  })

  it('UX-08: loadedKeys helpers compare paths case-insensitively', () => {
    const keys = [`${WS}\\Sandbox`]
    const removed = withoutLoadedTreeKey(keys, `${WS}\\sandbox`)
    expect(removed).toHaveLength(0)
    const added = withLoadedTreeKey([], `${WS}\\Sandbox`)
    expect(added).toHaveLength(1)
  })
})
