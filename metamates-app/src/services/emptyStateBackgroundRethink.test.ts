import { describe, expect, it } from 'vitest'
import {
  isEmptyStateRethinkJsonLeak,
  normalizeEmptyStateQuestionText,
  shouldHideAgentRethinkLeak,
} from '../../electron/shared/emptyStateRethinkLeak'
import { sanitizeAgentDisplayText } from '../../electron/shared/textNormalize'
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

  it('parses truncated JSON without closing quote', () => {
    const result = extractRethinkResult('{"questionText":"复盘刚落盘，7点半刚到家——')
    expect(result?.questionText).toBe('复盘刚落盘，7点半刚到家——')
  })

  it('detects and normalizes leaked JSON for display', () => {
    const leaked = '{"questionText":"你是先碰张院那个红标，还是'
    expect(isEmptyStateRethinkJsonLeak(leaked)).toBe(true)
    expect(normalizeEmptyStateQuestionText(leaked)).toBe('你是先碰张院那个红标，还是')
  })

  it('hides user-reported truncated JSON from agent chat', () => {
    const leaked = '{"questionText":"复盘已经做了两轮，slides还'
    expect(shouldHideAgentRethinkLeak(leaked)).toBe(true)
    expect(sanitizeAgentDisplayText(leaked)).toBe('')
    expect(sanitizeAgentDisplayText(`\n${leaked}`)).toBe('')
  })
})
