import { describe, expect, it } from 'vitest'
import {
  classifyAcpError,
  isGeminiModelDailyQuotaError,
  isNetworkErrorMessage,
  isQuotaError,
} from '../../electron/acp/acpErrors'

describe('acpErrors', () => {
  it('does not treat fetch failed as quota', () => {
    const msg = 'exception TypeError: fetch failed sending request'
    expect(isNetworkErrorMessage(msg)).toBe(true)
    expect(isQuotaError(msg)).toBe(false)
    expect(classifyAcpError(new Error(msg)).quotaExceeded).toBe(false)
  })

  it('does not treat prompt timeout as quota', () => {
    const msg = 'Request session/prompt timed out'
    expect(isNetworkErrorMessage(msg)).toBe(true)
    expect(classifyAcpError(new Error(msg)).quotaExceeded).toBe(false)
  })

  it('detects Gemini model daily quota separately from API balance', () => {
    const msg = 'You have exhausted your daily quota on this model.'
    expect(isGeminiModelDailyQuotaError(msg)).toBe(true)
    expect(isQuotaError(msg)).toBe(true)
    const classified = classifyAcpError(new Error(msg))
    expect(classified.geminiModelDailyQuota).toBe(true)
    expect(classified.quotaExceeded).toBe(true)
  })

  it('detects real API quota signals', () => {
    expect(isQuotaError('RESOURCE_EXHAUSTED: exceeded your current quota')).toBe(true)
    expect(isQuotaError('HTTP 429 too many requests')).toBe(true)
  })

  it('does not match quota inside unrelated long text', () => {
    expect(isQuotaError('discussion about quota management best practices')).toBe(false)
  })
})
