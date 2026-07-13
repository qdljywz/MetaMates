export type AcpFailureAction = 'reconnect' | 'auth' | 'switch_agent' | 'none'

export interface AcpFailureResolution {
  kind: 'disconnected' | 'auth_required' | 'quota' | 'generic'
  action: AcpFailureAction
}

export function resolveAcpFailure(err: {
  error?: string
  message?: string
  quotaExceeded?: boolean
  authRequired?: boolean
} | null | undefined): AcpFailureResolution {
  const text = (err?.error || err?.message || '').toLowerCase()
  if (
    err?.quotaExceeded
    || /arrearage|account is in good standing|overdue-payment|套餐已到期|plan expired|coding plan/i.test(text)
  ) {
    return { kind: 'quota', action: 'switch_agent' }
  }
  if (err?.authRequired) {
    return { kind: 'auth_required', action: 'auth' }
  }
  if (
    text.includes('disconnect')
    || text.includes('not connected')
    || text.includes('process exited')
    || text.includes('econnreset')
  ) {
    return { kind: 'disconnected', action: 'reconnect' }
  }
  return { kind: 'generic', action: 'none' }
}
