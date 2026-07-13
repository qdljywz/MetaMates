import { describe, it, expect } from 'vitest'
import { removeTreeNodeByPath, patchTreeNodeChildren } from './fileTreeUx'

const WS = 'E:\\Vault'

type TreeNode = { key: string; title: string; isLeaf: boolean; children?: TreeNode[] }
describe('fileTreeUx', () => {
  it('removeTreeNodeByPath 移除根级文件', () => {
    const tree: TreeNode[] = [
      { key: `${WS}\\a.md`, title: 'a.md', isLeaf: true },
      { key: `${WS}\\b.md`, title: 'b.md', isLeaf: true },
    ]
    const { tree: next, removed } = removeTreeNodeByPath(tree, `${WS}\\a.md`)
    expect(removed).toBe(true)
    expect(next).toHaveLength(1)
    expect(next[0].key).toBe(`${WS}\\b.md`)
  })

  it('removeTreeNodeByPath 移除嵌套文件', () => {
    const folderKey = `${WS}\\01_日记`
    const tree: TreeNode[] = [
      {
        key: folderKey,
        title: '01_日记',
        isLeaf: false,
        children: [
          { key: `${folderKey}\\foo.md`, title: 'foo.md', isLeaf: true },
          { key: `${folderKey}\\bar.md`, title: 'bar.md', isLeaf: true },
        ],
      },
    ]
    const { tree: next, removed } = removeTreeNodeByPath(tree, `${folderKey}\\foo.md`)
    expect(removed).toBe(true)
    expect(next[0].children).toHaveLength(1)
    expect(next[0].children![0].key).toBe(`${folderKey}\\bar.md`)
  })

  it('patchTreeNodeChildren 替换文件夹子节点', () => {
    const folderKey = `${WS}\\Inbox`
    const tree: TreeNode[] = [
      {
        key: folderKey,
        title: 'Inbox',
        isLeaf: false,
        children: [{ key: `${folderKey}\\old.md`, title: 'old.md', isLeaf: true }],
      },
    ]
    const children: TreeNode[] = [{ key: `${folderKey}\\new.md`, title: 'new.md', isLeaf: true }]
    const { tree: next, patched } = patchTreeNodeChildren(tree, folderKey, children)
    expect(patched).toBe(true)
    expect(next[0].children).toHaveLength(1)
    expect(next[0].children![0].key).toBe(`${folderKey}\\new.md`)
  })
})
