import { describe, expect, it } from 'vitest'
import { composeChatMessages } from '../../electron/shared/chatCompose'
import { composeChatBubble, normalizeHistoryBubble, sanitizeAgentDisplayText, unescapeLiteralEscapes } from '../services/agent-bridge/composeChatBubble'

describe('composeChatMessages (shared)', () => {
  it('merges streaming agent text chunks with same msg_id', () => {
    const first = {
      id: '1',
      type: 'text',
      msg_id: 'msg-1',
      position: 'left',
      content: { content: 'Hello' },
    }
    const second = {
      id: '2',
      type: 'text',
      msg_id: 'msg-1',
      position: 'left',
      content: { content: ' world' },
    }

    const merged = composeChatMessages([first], second)
    expect(merged).toHaveLength(1)
    expect((merged[0].content as { content?: string }).content).toBe('Hello world')
  })

  it('keeps user and agent messages separate', () => {
    const user = {
      id: '1',
      type: 'text',
      msg_id: 'u1',
      position: 'right',
      content: { content: 'Question?' },
    }
    const agent = {
      id: '2',
      type: 'text',
      msg_id: 'a1',
      position: 'left',
      content: { content: 'Answer' },
    }

    const merged = composeChatMessages([user], agent)
    expect(merged).toHaveLength(2)
    expect(merged[0].position).toBe('right')
    expect(merged[1].position).toBe('left')
  })
})

describe('normalizeHistoryBubble', () => {
  it('maps persisted user messages to right-aligned bubbles', () => {
    const bubble = normalizeHistoryBubble({
      id: '1',
      type: 'text',
      position: 'right',
      content: { content: '你好' },
    })
    expect(bubble.type).toBe('user')
    expect(bubble.position).toBe('right')
    expect(bubble.content).toBe('你好')
  })

  it('maps persisted agent messages to left-aligned bubbles', () => {
    const bubble = normalizeHistoryBubble({
      id: '2',
      type: 'text',
      position: 'left',
      content: { content: 'Hello' },
    })
    expect(bubble.type).toBe('agent')
    expect(bubble.position).toBe('left')
  })

  it('prefers display over full prompt content for user history', () => {
    const bubble = normalizeHistoryBubble({
      id: '3',
      type: 'text',
      position: 'right',
      content: {
        content: '[Assistant Rules]...\n\n[User Request]\n/today',
        display: '/today',
      },
    })
    expect(bubble.type).toBe('user')
    expect(bubble.content).toBe('/today')
  })
})

describe('composeChatBubble (UI)', () => {
  it('merges consecutive streaming agent bubbles', () => {
    const list = [{
      id: '1',
      type: 'agent',
      msg_id: 'm1',
      content: 'Hel',
      status: 'streaming',
    }]
    const merged = composeChatBubble(list, {
      id: '1',
      type: 'agent',
      msg_id: 'm1',
      content: 'lo',
      status: 'streaming',
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].content).toBe('Hello')
  })
})

describe('sanitizeAgentDisplayText', () => {
  it('unescapes literal \\n sequences from CLI tool payloads', () => {
    expect(unescapeLiteralEscapes('# Title\\n\\n- item')).toBe('# Title\n\n- item')
  })

  it('extracts markdown from leaked write_file JSON instead of showing raw JSON', () => {
    const payload = JSON.stringify({
      content: '# 2026-06-23\\n\\n- [ ] task',
      file_path: 'E:\\\\MyM2\\\\01_日记与计划\\\\2026-06-23 PLAN.md',
    })
    expect(sanitizeAgentDisplayText(payload)).toBe('# 2026-06-23\n\n- [ ] task')
  })

  it('suppresses bare tool arg JSON without readable content', () => {
    const payload = JSON.stringify({ file_path: 'E:\\\\vault\\\\PLAN.md' })
    expect(sanitizeAgentDisplayText(payload)).toBe('')
  })
})
