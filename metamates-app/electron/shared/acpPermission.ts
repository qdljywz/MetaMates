/**
 * ACP session/request_permission — normalize option shapes and pick allow.
 * CodeBuddy uses optionId "allow" | "allow_always" | "reject" (not id / allow_once).
 */

export interface NormalizedPermissionOption {
  optionId: string
  name?: string
  kind?: string
}

export function normalizePermissionOptions(raw: unknown): NormalizedPermissionOption[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedPermissionOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const optionId = String(o.optionId ?? o.option_id ?? o.id ?? '').trim()
    if (!optionId) continue
    out.push({
      optionId,
      name: typeof o.name === 'string' ? o.name : undefined,
      kind: typeof o.kind === 'string' ? o.kind : undefined,
    })
  }
  return out
}

/** Prefer allow_once-style option; fall back to allow_always. Never pick reject. */
export function pickAllowPermissionOption(raw: unknown): string {
  const options = normalizePermissionOptions(raw)
  if (options.length === 0) return 'allow_once'

  const allowOnce = options.find(
    (o) => o.kind === 'allow_once'
      || o.optionId === 'allow'
      || o.optionId === 'allow_once'
      || /^allow_once$/i.test(o.optionId),
  )
  if (allowOnce) return allowOnce.optionId

  const allowAlways = options.find(
    (o) => o.kind === 'allow_always' || o.optionId === 'allow_always',
  )
  if (allowAlways) return allowAlways.optionId

  const genericAllow = options.find((o) => /allow|approve|accept|yes/i.test(o.optionId))
  if (genericAllow) return genericAllow.optionId

  const notReject = options.find((o) => !/reject|deny|cancel|block/i.test(o.optionId))
  return notReject?.optionId || options[0].optionId
}

export function pickRejectPermissionOption(raw: unknown): string {
  const options = normalizePermissionOptions(raw)
  const reject = options.find(
    (o) => o.kind === 'reject_once'
      || o.kind === 'reject_always'
      || o.optionId === 'reject'
      || /reject|deny|cancel/i.test(o.optionId),
  )
  return reject?.optionId || 'reject'
}

export function buildPermissionAllowResponse(requestId: number, rawOptions: unknown): {
  jsonrpc: '2.0'
  id: number
  result: { outcome: { outcome: 'selected'; optionId: string } }
} {
  return {
    jsonrpc: '2.0',
    id: requestId,
    result: {
      outcome: {
        outcome: 'selected',
        optionId: pickAllowPermissionOption(rawOptions),
      },
    },
  }
}
