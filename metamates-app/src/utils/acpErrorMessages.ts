/** Detect subscription / plan expiry (e.g. GLM Coding Plan) vs generic quota. */
export function isPlanExpiredError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('套餐已到期')
    || lower.includes('subscription expired')
    || lower.includes('plan expired')
    || lower.includes('coding plan')
    || (lower.includes('glm') && lower.includes('到期'))
    || lower.includes('arrearage')
    || lower.includes('account is in good standing')
    || lower.includes('overdue-payment')
    || lower.includes('欠费')
    || lower.includes('余额不足')
  )
}

export function resolveAgentDisplayName(
  backend: string,
  agents: Array<{ backend: string; name: string }>,
): string {
  return agents.find((a) => a.backend === backend)?.name || backend
}

/** Turn raw ACP/CLI JSON errors into a short human-readable line. */
export function formatAcpErrorForDisplay(raw: string): string {
  if (!raw) return 'unknown'

  const jsonStart = raw.indexOf('{')
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string }
        message?: string
        code?: string
      }
      if (parsed.code === 'Arrearage') {
        return 'DashScope 账户欠费或余额不足，请充值后再试'
      }
      const inner = parsed?.error?.message || parsed?.message
      if (typeof inner === 'string' && inner.trim()) {
        const bracketMsg = inner.match(/\]\[([^\]]+)\]/)
        if (bracketMsg?.[1]) return bracketMsg[1].trim()
        return inner.trim()
      }
    } catch {
      // fall through
    }
  }

  if (/\"code\"\s*:\s*\"Arrearage\"/i.test(raw)) {
    return 'DashScope 账户欠费或余额不足，请充值后再试'
  }

  const apiMatch = raw.match(/API Error:\s*\d+\s*(.+)/i)
  if (apiMatch?.[1]) {
    return formatAcpErrorForDisplay(apiMatch[1].trim())
  }

  if (raw.length > 360) return `${raw.slice(0, 360)}…`
  return raw
}
