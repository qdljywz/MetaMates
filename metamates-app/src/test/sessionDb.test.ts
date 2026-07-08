import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const ROOT = process.cwd()
const TEST_SQLITE = path.join(ROOT, 'test-session.sqlite')
const TEST_JSON = path.join(ROOT, 'test-session-legacy.json')

function probeSessionDb(): boolean {
  for (const file of [TEST_SQLITE, `${TEST_SQLITE}-wal`, `${TEST_SQLITE}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
  process.env.SESSION_DB_SQLITE_PATH = TEST_SQLITE
  process.env.SESSION_DB_JSON_PATH = TEST_JSON
  try {
    const sessionDb = require(path.join(ROOT, 'dist-electron/acp/sessionDb.cjs'))
    const ready = sessionDb.isDatabaseAvailable()
    sessionDb.closeDatabase()
    return ready
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/NODE_MODULE_VERSION|better_sqlite3|EPERM/i.test(message)) {
      console.warn('[sessionDb.test] Skipping �?native module locked or ABI mismatch (close Electron and run npm run rebuild:native)')
      return false
    }
    throw error
  } finally {
    delete process.env.SESSION_DB_SQLITE_PATH
    delete process.env.SESSION_DB_JSON_PATH
    for (const file of [TEST_SQLITE, `${TEST_SQLITE}-wal`, `${TEST_SQLITE}-shm`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  }
}

const sqliteReady = probeSessionDb()

describe.skipIf(!sqliteReady)('sessionDb sqlite storage', () => {
  beforeAll(() => {
    for (const file of [TEST_SQLITE, `${TEST_SQLITE}-wal`, `${TEST_SQLITE}-shm`, TEST_JSON, `${TEST_JSON}.bak`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }

    process.env.SESSION_DB_SQLITE_PATH = TEST_SQLITE
    process.env.SESSION_DB_JSON_PATH = TEST_JSON

    fs.writeFileSync(TEST_JSON, JSON.stringify({
      conversations: {
        'conv-1': {
          id: 'conv-1',
          backend: 'gemini',
          name: 'Gemini conversation',
          extra: { mode: 'default' },
          created_at: 1,
          updated_at: 2,
        },
      },
      messages: {
        'conv-1': {
          'msg-1': {
            id: 'msg-1',
            conversation_id: 'conv-1',
            type: 'text',
            content: { content: 'hello' },
            position: 'right',
            status: 'finish',
            msg_id: 'msg-1',
            created_at: 3,
          },
        },
      },
    }, null, 2))
  }, 15000)

  afterAll(() => {
    delete process.env.SESSION_DB_SQLITE_PATH
    delete process.env.SESSION_DB_JSON_PATH

    for (const file of [TEST_SQLITE, `${TEST_SQLITE}-wal`, `${TEST_SQLITE}-shm`, TEST_JSON, `${TEST_JSON}.bak`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  })

  it('migrates legacy JSON and reads messages from sqlite', () => {
    const sessionDb = require(path.join(ROOT, 'dist-electron/acp/sessionDb.cjs'))

    const conversation = sessionDb.getConversationByBackend('gemini')
    expect(conversation?.id).toBe('conv-1')

    const messages = sessionDb.getAllConversationMessages('conv-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].content.content).toBe('hello')

    sessionDb.insertMessage({
      conversation_id: 'conv-1',
      type: 'text',
      content: { content: 'follow-up' },
      position: 'left',
    }, true)

    const updated = sessionDb.getAllConversationMessages('conv-1')
    expect(updated.length).toBeGreaterThanOrEqual(2)

    sessionDb.closeDatabase()
  })

  it('scopes conversations by workspace path', () => {
    const sessionDb = require(path.join(ROOT, 'dist-electron/acp/sessionDb.cjs'))

    sessionDb.createConversation('conv-a', 'gemini', 'Workspace A', {}, 'E:\\WorkspaceA')
    sessionDb.createConversation('conv-b', 'gemini', 'Workspace B', {}, 'E:\\WorkspaceB')

    expect(sessionDb.getConversationByBackend('gemini', 'E:\\WorkspaceA')?.id).toBe('conv-a')
    expect(sessionDb.getConversationByBackend('gemini', 'E:/WorkspaceB')?.id).toBe('conv-b')
    expect(sessionDb.getConversationByBackend('gemini', 'E:\\Other')).toBeNull()

    sessionDb.closeDatabase()
  })
})

describe('sessionDb sqlite storage (skipped probe)', () => {
  it.skipIf(sqliteReady)('documents skip when native module unavailable', () => {
    expect(sqliteReady).toBe(false)
  })
})
