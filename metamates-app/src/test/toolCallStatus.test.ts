import { describe, expect, it } from 'vitest'
import { mergeToolCallBubble } from '../services/agent-bridge/mergeChatBubble'
import {
  finalizeInProgressToolCalls,
  formatToolDisplayTitle,
  isToolCallInProgress,
  mergeToolCallStatus,
  sanitizeStaleSessionMessages,
} from '../utils/toolCallStatus'

describe('toolCallStatus', () => {
  it('detects in-progress statuses', () => {
    expect(isToolCallInProgress('in_progress')).toBe(true)
    expect(isToolCallInProgress('pending')).toBe(true)
    expect(isToolCallInProgress('completed')).toBe(false)
  })

  it('prefers terminal status on merge', () => {
    expect(mergeToolCallStatus('in_progress', 'completed')).toBe('completed')
    expect(mergeToolCallStatus('completed', 'in_progress')).toBe('completed')
  })

  it('finalizes stale in-progress tool cards', () => {
    const out = finalizeInProgressToolCalls([
      { type: 'tool-call', status: 'in_progress' },
      { type: 'agent', status: 'finish' },
    ])
    expect(out[0].status).toBe('completed')
    expect(out[1].status).toBe('finish')
  })

  it('sanitizes interrupted turns loaded from history', () => {
    const out = sanitizeStaleSessionMessages([
      { type: 'tool-call', status: 'pending' },
      { type: 'agent', status: 'streaming' },
      { type: 'thinking', status: 'streaming' },
    ])
    expect(out[0].status).toBe('completed')
    expect(out[1].status).toBe('finish')
    expect(out[2].status).toBe('finish')
  })

  it('formats generic read titles with file leaf name', () => {
    expect(
      formatToolDisplayTitle('Read', 'E:\\Vault\\05_模板\\Master_Control.md', 'Read'),
    ).toBe('Read · Master_Control.md')
  })
})

describe('mergeToolCallBubble', () => {
  it('merges completed update onto last in-progress tool when ids differ', () => {
    const list = [
      {
        id: '1',
        type: 'tool-call',
        toolCallId: 'a',
        kind: 'read',
        status: 'in_progress',
        title: 'Read',
      },
    ]
    const incoming = {
      id: '2',
      type: 'tool-call',
      toolCallId: 'b',
      kind: 'read',
      status: 'completed',
      title: 'Read',
      content: 'file body',
    }
    const merged = mergeToolCallBubble(list, incoming)
    expect(merged.length).toBe(1)
    expect(merged[0].status).toBe('completed')
    expect(merged[0].content).toBe('file body')
  })
})
