import { describe, expect, it } from 'vitest'
import { deriveSessionTitle, countUserMessages } from '../utils/sessionTitle'

describe('sessionTitle', () => {
  it('uses first user message as session title', () => {
    const title = deriveSessionTitle([
      { type: 'agent', content: 'Hello' },
      { type: 'user', content: 'What model are we using?' },
    ], 'New session')

    expect(title).toBe('What model are we using?')
  })

  it('truncates long titles', () => {
    const longText = 'a'.repeat(60)
    const title = deriveSessionTitle([{ type: 'user', content: longText }], 'New session', 20)
    expect(title).toBe(`${'a'.repeat(20)}…`)
  })

  it('falls back when there is no user message', () => {
    expect(deriveSessionTitle([{ type: 'agent', content: 'Hi' }], '新会话')).toBe('新会话')
  })

  it('counts user messages', () => {
    expect(countUserMessages([
      { type: 'user', content: 'one' },
      { type: 'agent', content: 'two' },
      { type: 'user', content: 'three' },
    ])).toBe(2)
  })
})
