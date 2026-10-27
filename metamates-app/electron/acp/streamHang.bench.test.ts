/**
 * Bench: tool_call_update hot path must stay off the main-thread danger zone.
 * Simulates a long conversation + many tool updates (the "CLI streaming + click" hang).
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
  getToolCallMessageByMsgId,
  insertMessage,
  updateMessage,
  getAllConversationMessages,
  isDatabaseAvailable,
} from './sessionDb'

describe('stream hang hot path (tool updates)', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pomo-hang-'))
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

  it('msg_id lookup beats full-table scan under a fat conversation', () => {
    // better-sqlite3 ABI often mismatches Vitest's Node vs Electron — skip locally.
    if (!isDatabaseAvailable()) {
      console.warn('[streamHang.bench] SQLite unavailable — skipping timing assert')
      return
    }
    const conv = createConversation('codebuddy', 'codebuddy', 'hang-bench', {}, tmp)
    const seeded = insertMessage(
      {
        conversation_id: conv.id,
        type: 'agent',
        content: { text: 'probe' },
        position: 'left',
        status: 'finish',
      },
      false,
    )
    if (!seeded) {
      console.warn('[streamHang.bench] insert failed — skipping timing assert')
      return
    }
    // Seed many rows like a long chat history
    for (let i = 0; i < 200; i++) {
      insertMessage(
        {
          conversation_id: conv.id,
          type: 'agent',
          content: { text: `msg-${i}-${'x'.repeat(200)}` },
          position: 'left',
          status: 'finish',
        },
        false,
      )
    }
    const toolId = 'tool-hot-1'
    insertMessage(
      {
        conversation_id: conv.id,
        type: 'acp_tool_call',
        msg_id: toolId,
        content: {
          update: {
            toolCallId: toolId,
            title: 'Read',
            status: 'in_progress',
            content: 'partial-'.repeat(500),
          },
        },
        position: 'left',
        status: 'streaming',
      },
      false,
    )

    const tScan0 = performance.now()
    for (let i = 0; i < 50; i++) {
      const all = getAllConversationMessages(conv.id)
      const hit = all.find(
        (m) => m.type === 'acp_tool_call' && m.content?.update?.toolCallId === toolId,
      )
      expect(hit).toBeTruthy()
      if (hit) {
        updateMessage(hit.id, {
          update: { ...hit.content.update, status: 'in_progress', content: `chunk-${i}` },
        })
      }
    }
    const scanMs = performance.now() - tScan0

    const tIdx0 = performance.now()
    for (let i = 0; i < 50; i++) {
      const hit = getToolCallMessageByMsgId(conv.id, toolId)
      expect(hit).toBeTruthy()
      if (hit) {
        updateMessage(hit.id, {
          update: { ...hit.content.update, status: 'in_progress', content: `idx-${i}` },
        })
      }
    }
    const idxMs = performance.now() - tIdx0

    // Indexed path should be meaningfully faster (and stay well under hang threshold).
    expect(idxMs).toBeLessThan(scanMs)
    expect(idxMs).toBeLessThan(1500)
  })
})
