import { describe, it, expect } from 'vitest'
import { getDirectoryAncestors, collectRequiredExpandKeys } from './fileTreeExpand'

const WS = 'E:\\Trae\\Metamates\\Test\\test0407'

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
