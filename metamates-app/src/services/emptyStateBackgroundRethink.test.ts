import { describe, expect, it } from 'vitest'
import { extractRethinkResult } from './emptyStateBackgroundRethink'

describe('extractRethinkResult', () => {
  it('parses strict JSON', () => {
    const result = extractRethinkResult(
      '{"questionText":"今天先清哪一条 inbox？","contextLineText":"16:00 · inbox 25 条"}',
    )
    expect(result?.questionText).toBe('今天先清哪一条 inbox？')
    expect(result?.contextLineText).toBe('16:00 · inbox 25 条')
  })

  it('tolerates malformed questionText keys from agents', () => {
    const result = extractRethinkResult(
      '{"questionText点 inbox积到25":"20 + inbox25项积压闭环"}',
    )
    expect(result?.questionText).toBe('20 + inbox25项积压闭环')
  })

  it('falls back to quoted prose when JSON is unusable', () => {
    const result = extractRethinkResult(
      '好的，我的判断是："收件箱积压是否正在拖慢今天的计划？"',
    )
    expect(result?.questionText).toContain('收件箱积压')
  })
})
