import { describe, it, expect } from 'vitest'
import { getRenameTabPayload, getTabPathsToCloseForDeletedFile } from './tabFileSync'

const WS = 'E:\\MyM2\\02_项目与知识\\_MetaMates_E2E'

describe('tabFileSync', () => {
  it('getRenameTabPayload returns payload when an open tab matches old path', () => {
    const oldPath = `${WS}\\note.md`
    const newPath = `${WS}\\note-renamed.md`
    const payload = getRenameTabPayload(
      [{ path: oldPath, name: 'note.md' }],
      oldPath,
      newPath,
      'note-renamed.md',
    )
    expect(payload).toEqual({ oldPath, newPath, newName: 'note-renamed.md' })
  })

  it('getTabPathsToCloseForDeletedFile matches by normalized path', () => {
    const deleted = `${WS}\\note-renamed.md`
    const tabs = [{ path: `${WS.replace(/\\/g, '/')}/note-renamed.md`, name: 'note.md' }]
    expect(getTabPathsToCloseForDeletedFile(tabs, deleted)).toEqual([tabs[0].path])
  })

  it('getTabPathsToCloseForDeletedFile matches stale tab title after rename', () => {
    const deleted = `${WS}\\note-renamed.md`
    const tabs = [{ path: `${WS}\\note.md`, name: 'note-renamed.md' }]
    expect(getTabPathsToCloseForDeletedFile(tabs, deleted)).toEqual([tabs[0].path])
  })

  it('getTabPathsToCloseForDeletedFile returns empty when no tab matches', () => {
    const deleted = `${WS}\\gone.md`
    const tabs = [{ path: `${WS}\\other.md`, name: 'other.md' }]
    expect(getTabPathsToCloseForDeletedFile(tabs, deleted)).toEqual([])
  })
})
