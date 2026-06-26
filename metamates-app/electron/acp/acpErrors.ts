/**
 * Classify ACP / backend error messages for UI handling.
 */

export interface ClassifiedAcpError {
  message: string
  quotaExceeded: boolean
  authRequired: boolean
  networkError: boolean
  geminiModelDailyQuota: boolean
}

/** Transient connectivity / spawn issues — never treat as billing quota. */
export function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('fetch failed')
    || lower.includes('econnrefused')
    || lower.includes('enotfound')
    || lower.includes('etimedout')
    || lower.includes('socket hang up')
    || lower.includes('network error')
    || lower.includes('request session/prompt timed out')
    || lower.includes('bytesring')
    || /\btimed out\b/.test(lower)
  )
}

/** Gemini CLI free-tier daily cap on a specific model — not the same as API key balance. */
export function isGeminiModelDailyQuotaError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('daily quota on this model')
    || lower.includes('terminalquotaerror')
  )
}

/**
 * Whether an error message indicates API quota or rate limit exhaustion (any backend).
 * Uses strict patterns — avoids mislabeling network/auth failures as quota.
 */
export function isQuotaError(message: string): boolean {
  if (isNetworkErrorMessage(message)) return false
  if (isGeminiModelDailyQuotaError(message)) return true

  const lower = message.toLowerCase()
  return (
    lower.includes('resource_exhausted')
    || lower.includes('resource exhausted')
    || lower.includes('rate limit exceeded')
    || lower.includes('rate_limit_exceeded')
    || /\b429\b/.test(lower)
    || lower.includes('exceeded your current quota')
    || lower.includes('quota exceeded')
    || lower.includes('too many requests')
  )
}

export function isAuthErrorMessage(message: string): boolean {
  if (isNetworkErrorMessage(message)) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('not authenticated')
    || lower.includes('unauthorized')
    || lower.includes('api key')
    || lower.includes('apikey')
    || lower.includes('invalid credentials')
    || /\b401\b/.test(lower)
    || /\b403\b/.test(lower)
    || (lower.includes('auth') && (lower.includes('required') || lower.includes('login')))
  )
}

export function classifyAcpError(error: unknown): ClassifiedAcpError {
  const message = error instanceof Error ? error.message : String(error)
  const geminiModelDailyQuota = isGeminiModelDailyQuotaError(message)
  const networkError = isNetworkErrorMessage(message)
  return {
    message,
    quotaExceeded: !networkError && isQuotaError(message),
    authRequired: !networkError && isAuthErrorMessage(message),
    networkError,
    geminiModelDailyQuota,
  }
}
