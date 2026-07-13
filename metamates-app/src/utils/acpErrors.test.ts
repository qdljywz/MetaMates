import { describe, expect, it } from 'vitest'
import { classifyAcpError, isAuthErrorMessage, isBillingOrPlanError, isQuotaError } from '../../electron/acp/acpErrors'

describe('acpErrors billing classification', () => {
  const arrearage =
    'Internal error: API Error: 400 id:1\ndata:{"code":"Arrearage","message":"Access denied, please make sure your account is in good standing."}'

  it('detects DashScope arrearage as billing', () => {
    expect(isBillingOrPlanError(arrearage)).toBe(true)
    expect(isQuotaError(arrearage)).toBe(true)
    expect(isAuthErrorMessage(arrearage)).toBe(false)
  })

  it('classifies arrearage as quota not auth', () => {
    const classified = classifyAcpError(new Error(arrearage))
    expect(classified.quotaExceeded).toBe(true)
    expect(classified.authRequired).toBe(false)
  })
})
