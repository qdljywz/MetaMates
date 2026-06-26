import { describe, expect, it } from 'vitest'
import { mergeHistoryWithStreaming, preferTextMessageVersion } from '../utils/messageMerge'

describe('messageMerge', () => {
  it('prefers longer streaming text over db snapshot', () => {
    const db = { id: '1', msg_id: 'm1', type: 'text', content: { content: 'hi' } }
    const stream = { id: '2', msg_id: 'm1', type: 'text', content: { content: 'hello world' } }
    expect(preferTextMessageVersion(db, stream)).toEqual(stream)
  })

  it('merges history with in-flight streaming messages', () => {
    const history = [{ id: '1', msg_id: 'm1', type: 'text', content: { content: 'old' } }]
    const existing = [
      { id: '2', msg_id: 'm1', type: 'text', content: { content: 'streaming longer' } },
      { id: '3', type: 'text', content: { content: 'only live' } },
    ]
    const merged = mergeHistoryWithStreaming(history, existing)
    expect(merged).toHaveLength(2)
    expect((merged[0] as { content: { content: string } }).content.content).toBe('streaming longer')
    expect(merged[1].id).toBe('3')
  })
})
