import { describe, expect, it } from 'vitest'
import { extractFilePathFromToolText, extractLineNumberFromToolText, mergeToolCallBubble } from '../services/agent-bridge/mergeChatBubble'
import { normalizeHistoryBubble } from '../services/agent-bridge/composeChatBubble'

describe('mergeChatBubble', () => {
  it('merges tool-call updates by toolCallId', () => {
    const list = [{
      id: '1',
      type: 'tool-call',
      toolCallId: 'tool1',
      title: 'Read file',
      status: 'in_progress',
    }]

    const merged = mergeToolCallBubble(list, {
      id: '1',
      type: 'tool-call',
      toolCallId: 'tool1',
      status: 'completed',
      content: 'done',
    })

    expect(merged).toHaveLength(1)
    expect(merged[0].status).toBe('completed')
    expect(merged[0].content).toBe('done')
    expect(merged[0].title).toBe('Read file')
  })

  it('appends new tool-call when toolCallId differs', () => {
    const list = [{
      id: '1',
      type: 'tool-call',
      toolCallId: 'tool1',
      title: 'Read file',
    }]

    const merged = mergeToolCallBubble(list, {
      id: '2',
      type: 'tool-call',
      toolCallId: 'tool2',
      title: 'Write file',
    })

    expect(merged).toHaveLength(2)
  })
})

describe('extractFilePathFromToolText', () => {
  it('extracts markdown file paths from tool text', () => {
    expect(extractFilePathFromToolText('Read notes/daily.md')).toBe('notes/daily.md')
    expect(extractFilePathFromToolText('E:\\Vault\\Inbox\\idea.md')).toBe('E:\\Vault\\Inbox\\idea.md')
  })

  it('extracts line numbers from tool text', () => {
    expect(extractLineNumberFromToolText('notes/daily.md:42')).toBe(42)
    expect(extractLineNumberFromToolText('at line 10')).toBe(10)
  })
})

describe('normalizeHistoryBubble attachments', () => {
  it('restores attachment chips from persisted user messages', () => {
    const bubble = normalizeHistoryBubble({
      id: '1',
      type: 'text',
      position: 'right',
      content: {
        content: 'Summarize this',
        attachments: [{ path: '/vault/Inbox/note.md', name: 'note.md' }],
      },
    })

    expect(bubble.type).toBe('user')
    expect(bubble.content).toBe('Summarize this')
    expect(bubble.attachments).toEqual([{ path: '/vault/Inbox/note.md', name: 'note.md' }])
  })

  it('prefers display label over stored prompt for slash commands', () => {
    const bubble = normalizeHistoryBubble({
      id: '2',
      type: 'text',
      position: 'right',
      content: {
        content: 'Read my vault and summarize today...',
        display: 'today',
      },
    })

    expect(bubble.content).toBe('today')
  })
})
