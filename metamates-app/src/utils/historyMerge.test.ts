import { describe, expect, it } from 'vitest'

/** Mirrors AgentChatPanel applyHistoryBatch merge for in-flight messages. */
function mergeHistoryWithExisting(
  converted: Array<{ id: string; content?: string }>,
  existing: Array<{ id: string; content?: string }>,
): Array<{ id: string; content?: string }> {
  const historyIds = new Set(converted.map((m) => m.id).filter(Boolean))
  const tail = existing.filter((m) => !m.id || !historyIds.has(m.id))
  return [...converted, ...tail]
}

describe('history merge', () => {
  it('appends in-flight messages after loaded history', () => {
    const history = [
      { id: 'h1', content: 'old' },
      { id: 'h2', content: 'older' },
    ]
    const inFlight = [{ id: 'u1', content: 'just sent' }]
    expect(mergeHistoryWithExisting(history, inFlight)).toEqual([...history, ...inFlight])
  })

  it('dedupes by id', () => {
    const history = [{ id: 'h1', content: 'same' }]
    const existing = [{ id: 'h1', content: 'same' }]
    expect(mergeHistoryWithExisting(history, existing)).toEqual(history)
  })
})
