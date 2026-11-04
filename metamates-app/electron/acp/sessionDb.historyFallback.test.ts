/**
 * Failure mode: vault conversations.sqlite rows with empty/legacy workspace_path
 * made getConversationByBackend miss history → empty CLI chat after restart.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setCurrentWorkspacePath } from '../shared/workspaceState'
import {
  bindConversationDatabase,
  closeDatabase,
  createConversation,
  getConversationByBackend,
  insertMessage,
  isDatabaseAvailable,
} from './sessionDb'

describe('getConversationByBackend workspace_path fallback', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-fallback-'))
    setCurrentWorkspacePath(tmp)
    bindConversationDatabase(tmp)
  })

  afterEach(() => {
    closeDatabase()
    setCurrentWorkspacePath('')
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('returns legacy empty workspace_path conversation for the open vault', () => {
    if (!isDatabaseAvailable()) {
      console.warn('[historyFallback] SQLite unavailable — skipping')
      return
    }

    // Simulate legacy row: messages exist but workspace_path was never filled.
    const legacy = createConversation('claude-legacy', 'claude', 'legacy', {}, '')
    insertMessage(
      {
        conversation_id: legacy.id,
        type: 'text',
        content: { content: 'LEGACY_HISTORY_SEED' },
        position: 'right',
        status: 'finish',
      },
      false,
    )

    const found = getConversationByBackend('claude', tmp)
    expect(found?.id).toBe(legacy.id)
  })
})
