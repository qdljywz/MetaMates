import { describe, expect, it, vi, beforeEach } from 'vitest'
import { openSlashWritebackInEditor, pruneMissingOpenTabs } from './openSlashWriteback'
import { appReducer, initialState } from '../store/appStore'

vi.mock('../constants/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants/paths')>()
  return {
    ...actual,
    getTodayDateString: () => '2026-07-07',
  }
})

describe('openSlashWritebackInEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      electronAPI: {
        path: {
          join: async (...parts: string[]) => parts.join('\\').replace(/\\+/g, '\\'),
        },
        fileExists: async (p: string) => ({
          exists: p.includes('2026-07-07 PLAN.md'),
        }),
      },
    })
  })

  it('opens today plan tab when file exists', async () => {
    let state = initialState
    const dispatch = (action: Parameters<typeof appReducer>[1]) => {
      state = appReducer(state, action)
    }

    const opened = await openSlashWritebackInEditor({
      cmdId: '/today',
      workspacePath: 'E:\\MyM2',
      language: 'zh',
      dispatch,
    })

    expect(opened).toContain('2026-07-07 PLAN.md')
    expect(state.openTabs.some((tab) => tab.path.includes('PLAN.md'))).toBe(true)
    expect(state.currentFile).toContain('PLAN.md')
  })
})

describe('pruneMissingOpenTabs', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      electronAPI: {
        fileExists: async (p: string) => ({ exists: !p.includes('missing') }),
      },
    })
  })

  it('closes tabs for missing files', async () => {
    let state = appReducer(initialState, {
      type: 'ADD_TAB',
      payload: { path: 'E:\\MyM2\\keep.md', name: 'keep.md', isDirty: false },
    })
    state = appReducer(state, {
      type: 'ADD_TAB',
      payload: { path: 'E:\\MyM2\\missing.md', name: 'missing.md', isDirty: false },
    })
    const dispatch = (action: Parameters<typeof appReducer>[1]) => {
      state = appReducer(state, action)
    }

    const removed = await pruneMissingOpenTabs({
      workspacePath: 'E:\\MyM2',
      tabPaths: state.openTabs.map((tab) => tab.path),
      dispatch,
    })

    expect(removed).toEqual(['E:\\MyM2\\missing.md'])
    expect(state.openTabs).toHaveLength(1)
    expect(state.openTabs[0]?.name).toBe('keep.md')
    expect(state.currentFile).toBe('E:\\MyM2\\keep.md')
  })
})
