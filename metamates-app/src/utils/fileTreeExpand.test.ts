import { describe, it, expect } from 'vitest'
import { getDirectoryAncestors, collectRequiredExpandKeys, getTreeRefreshParentDir } from './fileTreeExpand'

const WS = 'E:\\Trae\\MetaMates\\Test\\test0407'

describe('fileTreeExpand', () => {
  it('returns nested ancestor folders for a deep file', () => {
    const file = `${WS}\\02_项目与知识\\智脉先锋\\概览.md`
    expect(getDirectoryAncestors(file, WS)).toEqual([
      `${WS}\\02_项目与知识`,
      `${WS}\\02_项目与知识\\智脉先锋`,
    ])
  })

  it('returns single ancestor for root-level file', () => {
    expect(getDirectoryAncestors(`${WS}\\README.md`, WS)).toEqual([])
  })

  it('getTreeRefreshParentDir 应返回变更文件的父目录', () => {
    expect(
      getTreeRefreshParentDir(WS, {
        dirPath: WS,
        filename: '01_日记与计划\\Inbox\\2026-06-29.md',
      }),
    ).toBe(`${WS}\\01_日记与计划\\Inbox`)
    expect(getTreeRefreshParentDir(WS, undefined)).toBe(WS)
  })

  it('merges ancestors from multiple open tabs', () => {
    const keys = collectRequiredExpandKeys(
      [
        `${WS}\\01_日记与计划\\a.md`,
        `${WS}\\02_项目与知识\\b.md`,
      ],
      WS,
    )
    expect(keys).toContain(`${WS}\\01_日记与计划`)
    expect(keys).toContain(`${WS}\\02_项目与知识`)
  })
})
