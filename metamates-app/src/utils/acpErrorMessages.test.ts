import { describe, expect, it } from 'vitest'
import { isPlanExpiredError, resolveAgentDisplayName, formatAcpErrorForDisplay } from './acpErrorMessages'

describe('acpErrorMessages', () => {
  it('detects GLM plan expiry', () => {
    const msg = '[1309][您的GLM Coding Plan套餐已到期，暂无法使用'
    expect(isPlanExpiredError(msg)).toBe(true)
  })

  it('formats nested JSON API errors', () => {
    const raw = 'Internal error: API Error: 429 {"type":"error","error":{"message":"[1309][您的GLM Coding Plan套餐已到期][id]"}}'
    expect(formatAcpErrorForDisplay(raw)).toBe('您的GLM Coding Plan套餐已到期')
  })
})
