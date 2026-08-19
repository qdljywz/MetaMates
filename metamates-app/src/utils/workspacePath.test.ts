import { describe, expect, it } from 'vitest'
import { resolveConversationSqlitePath } from '../../electron/shared/conversationDbPath'
import { workspacePathKey, workspacePathsEqual, normalizeWorkspacePath } from '../../electron/shared/workspacePath'

describe('workspacePath', () => {
  it('treats Windows drive-letter case as the same vault', () => {
    if (process.platform !== 'win32') return
    expect(workspacePathsEqual('E:\\MyM2', 'e:\\MyM2')).toBe(true)
    expect(workspacePathKey('E:\\MyM2')).toBe(workspacePathKey('e:/MyM2'))
  })

  it('does not treat empty workspace as a real vault', () => {
    expect(normalizeWorkspacePath('')).toBe('')
    expect(workspacePathsEqual('', 'E:\\MyM2')).toBe(false)
  })
})

describe('conversation sqlite path', () => {
  it('stores a bound vault under .metamates', () => {
    const dbPath = resolveConversationSqlitePath({
      workspacePath: 'E:\\MyM2',
      userDataDir: 'C:\\Users\\x\\AppData\\Roaming\\metamates-app',
    })
    expect(dbPath.replace(/\\/g, '/')).toMatch(/MyM2\/\.metamates\/conversations\.sqlite$/)
  })

  it('falls back to userData when no workspace is open', () => {
    const dbPath = resolveConversationSqlitePath({
      workspacePath: '',
      userDataDir: 'C:\\Users\\x\\AppData\\Roaming\\metamates-app',
    })
    expect(dbPath.replace(/\\/g, '/')).toBe('C:/Users/x/AppData/Roaming/metamates-app/conversations.sqlite')
  })
})
