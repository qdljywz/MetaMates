import { describe, expect, it } from 'vitest'
import {
  buildAgentChatErrorContent,
  normalizeAgentErrorText,
  resolveAgentChatErrorKind,
} from './agentChatErrorContent'

const t = (key: string, params?: Record<string, string>) => {
  const map: Record<string, string> = {
    'status.upstreamBillingDetail': `BILLING:${params?.agent}:${params?.error}`,
    'status.connectFailedDetail': `CONNECT:${params?.agent}:${params?.error}`,
    'status.promptFailedDetail': `PROMPT:${params?.agent}:${params?.error}`,
  }
  return map[key] || key
}

describe('agentChatErrorContent', () => {
  it('classifies DashScope arrearage as upstream billing', () => {
    const raw =
      'Internal error: API Error: 400 data:{"code":"Arrearage","message":"Access denied"}'
    const errorText = normalizeAgentErrorText({ error: raw })
    expect(errorText).toContain('欠费')
    expect(resolveAgentChatErrorKind({ error: raw }, errorText, 'claude')).toBe('upstream_billing')
  })

  it('builds billing message with agent name', () => {
    const content = buildAgentChatErrorContent({
      backend: 'claude',
      agentName: 'Claude Code',
      errorText: 'DashScope 账户欠费或余额不足，请充值后再试',
      kind: 'upstream_billing',
      t: t as never,
    })
    expect(content).toContain('BILLING:Claude Code:')
  })

  it('uses connect context copy for session failures', () => {
    const content = buildAgentChatErrorContent({
      backend: 'claude',
      agentName: 'Claude Code',
      errorText: '无法连接云端 API',
      kind: 'generic',
      t: t as never,
      context: 'connect',
    })
    expect(content.startsWith('CONNECT:')).toBe(true)
  })
})
