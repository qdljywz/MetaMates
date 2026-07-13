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

  it('formats DashScope arrearage', () => {
    const raw =
      'Internal error: API Error: 400 id:1\ndata:{"code":"Arrearage","message":"Access denied, please make sure your account is in good standing."}'
    expect(formatAcpErrorForDisplay(raw)).toBe('DashScope 账户欠费或余额不足，请充值后再试')
    expect(isPlanExpiredError(raw)).toBe(true)
  })
})
