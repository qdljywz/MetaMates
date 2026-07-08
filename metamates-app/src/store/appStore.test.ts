import { describe, expect, it } from 'vitest'
import { appReducer, initialState } from './appStore'

describe('appReducer file open sync', () => {
  it('SET_CURRENT_FILE adds a tab when opening a file without one', () => {
    const next = appReducer(initialState, {
      type: 'SET_CURRENT_FILE',
      payload: 'E:\\vault\\notes\\20260701对齐会议.md',
    })

    expect(next.openTabs).toHaveLength(1)
    expect(next.openTabs[0]?.name).toBe('20260701对齐会议.md')
    expect(next.currentFile).toBe('E:\\vault\\notes\\20260701对齐会议.md')
  })

  it('SET_CURRENT_FILE activates an existing tab without duplicating', () => {
    const withTab = appReducer(initialState, {
      type: 'ADD_TAB',
      payload: { path: 'E:\\vault\\a.md', name: 'a.md', isDirty: false },
    })

    const next = appReducer(withTab, {
      type: 'SET_CURRENT_FILE',
      payload: 'e:\\vault\\a.md',
    })

    expect(next.openTabs).toHaveLength(1)
    expect(next.currentFile).toBe('E:\\vault\\a.md')
  })

  it('ADD_TAB reuses an existing tab case-insensitively on Windows', () => {
    const withTab = appReducer(initialState, {
      type: 'ADD_TAB',
      payload: { path: 'E:\\vault\\a.md', name: 'a.md', isDirty: false },
    })

    const next = appReducer(withTab, {
      type: 'ADD_TAB',
      payload: { path: 'e:\\vault\\a.md', name: 'a.md', isDirty: false },
    })

    expect(next.openTabs).toHaveLength(1)
    expect(next.currentFile).toBe('E:\\vault\\a.md')
  })
})
