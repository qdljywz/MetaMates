import { describe, expect, it } from 'vitest'
import { finalizeInProgressToolCalls, sanitizeStaleSessionMessages } from '../utils/toolCallStatus'

describe('session lifecycle cleanup', () => {
  it('sanitizes stale tool cards and streaming agent messages from history', () => {
    const out = sanitizeStaleSessionMessages([
      { type: 'tool-call', status: 'in_progress' },
      { type: 'agent', status: 'streaming', content: 'partial' },
    ])
    expect(out[0].status).toBe('completed')
    expect(out[1].status).toBe('finish')
  })

  it('finalizes in-progress tools without touching finished messages', () => {
    const out = finalizeInProgressToolCalls([
      { type: 'tool-call', status: 'pending' },
      { type: 'agent', status: 'finish' },
    ])
    expect(out[0].status).toBe('completed')
    expect(out[1].status).toBe('finish')
  })
})
