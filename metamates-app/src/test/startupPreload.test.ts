import { describe, expect, it, beforeEach } from 'vitest'
import {
  markStartupWorkspaceInit,
  wasStartupIndexAttached,
  wasStartupWorkspaceInitDone,
} from '../utils/startupPreload'

describe('startupPreload flags', () => {
  beforeEach(() => {
    delete window.__METAMATES_STARTUP__
  })

  it('tracks workspace init done for a path', () => {
    markStartupWorkspaceInit('E:\\MyM2')
    expect(wasStartupWorkspaceInitDone('E:\\MyM2')).toBe(true)
    expect(wasStartupWorkspaceInitDone('E:\\Other')).toBe(false)
  })

  it('tracks index attach for a path', () => {
    window.__METAMATES_STARTUP__ = {
      workspacePath: 'E:\\MyM2',
      indexAttached: true,
    }
    expect(wasStartupIndexAttached('E:\\MyM2')).toBe(true)
    expect(wasStartupIndexAttached('E:\\Other')).toBe(false)
  })
})
