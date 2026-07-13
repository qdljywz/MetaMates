import type { TFunction } from 'i18next'
import { isPlanExpiredError, formatAcpErrorForDisplay } from './acpErrorMessages'
import { resolveAcpFailure } from './acpFailureResolution'
import { isGeminiModelDailyQuotaError, isNetworkErrorMessage } from '../../electron/acp/acpErrors'

export type AgentChatErrorKind =
  | 'gemini_daily_quota'
  | 'network'
  | 'upstream_billing'
  | 'upstream_quota'
  | 'auth'
  | 'disconnected'
  | 'connect_failed'
  | 'generic'

export function resolveAgentChatErrorKind(
  err: { error?: string; message?: string; quotaExceeded?: boolean; authRequired?: boolean } | null | undefined,
  errorText: string,
  backend: string,
): AgentChatErrorKind {
  if (isGeminiModelDailyQuotaError(errorText) && backend === 'gemini') {
    return 'gemini_daily_quota'
  }
  if (isNetworkErrorMessage(errorText)) return 'network'

  if (isPlanExpiredError(errorText) || isPlanExpiredError(err?.error || err?.message || '')) {
    return 'upstream_billing'
  }

  const resolution = resolveAcpFailure({ ...err, error: errorText, message: err?.message || errorText })
  if (resolution.kind === 'quota') {
    return isPlanExpiredError(errorText) || isPlanExpiredError(err?.error || err?.message || '')
      ? 'upstream_billing'
      : 'upstream_quota'
  }
  if (resolution.kind === 'auth_required') return 'auth'
  if (resolution.kind === 'disconnected') return 'disconnected'
  return 'generic'
}

export function buildAgentChatErrorContent(args: {
  backend: string
  agentName: string
  errorText: string
  kind: AgentChatErrorKind
  t: TFunction
  alternateHint?: string
  context?: 'prompt' | 'connect'
}): string {
  const { agentName, errorText, kind, t, alternateHint, context = 'prompt' } = args
  let body: string

  switch (kind) {
    case 'gemini_daily_quota':
      body = t('status.geminiModelDailyQuotaDetail', { agent: agentName, error: errorText })
      break
    case 'network':
      body = t('status.networkErrorDetail', { agent: agentName, error: errorText })
      break
    case 'upstream_billing':
      body = t('status.upstreamBillingDetail', { agent: agentName, error: errorText })
      break
    case 'upstream_quota':
      body = t('status.upstreamQuotaDetail', { agent: agentName, error: errorText })
      break
    case 'auth':
      body = t('status.authRequiredDetail', { agent: agentName, error: errorText })
      break
    case 'disconnected':
      body = t('status.reconnectHint')
      break
    case 'connect_failed':
      body = t('status.connectFailedDetail', { agent: agentName, error: errorText })
      break
    default:
      body = context === 'connect'
        ? t('status.connectFailedDetail', { agent: agentName, error: errorText })
        : t('status.promptFailedDetail', { agent: agentName, error: errorText })
  }

  return alternateHint ? `${body}\n\n${alternateHint}` : body
}

export function normalizeAgentErrorText(
  err: { error?: string; message?: string } | null | undefined,
): string {
  return formatAcpErrorForDisplay(err?.error || err?.message || 'unknown')
}
