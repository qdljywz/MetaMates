/**
 * Pure policy helpers for agent CLI config — testable without filesystem.
 */

const CREDENTIAL_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const

export function isValidAnthropicCredential(value: string | null | undefined): value is string {
  if (!value) return false
  const trimmed = value.trim()
  return trimmed.length >= 8
}

export function hasAnthropicCredentialInRecord(record: Record<string, string | undefined>): boolean {
  return CREDENTIAL_KEYS.some((key) => isValidAnthropicCredential(record[key]))
}

/** Model is owned by ~/.claude/settings.json when ANTHROPIC_MODEL is set there. */
export function isClaudeModelCliLocked(settingsFileEnv: Record<string, string>): boolean {
  return !!settingsFileEnv.ANTHROPIC_MODEL?.trim()
}

/**
 * Proxy / third-party Claude: model routing is owned by CLI settings, not ACP picker.
 * Includes BASE_URL + credential setups even when ANTHROPIC_MODEL is absent.
 */
export function isClaudeModelPickerLocked(settingsFileEnv: Record<string, string>): boolean {
  return isClaudeModelCliLocked(settingsFileEnv)
    || !!settingsFileEnv.ANTHROPIC_BASE_URL?.trim()
    || hasAnthropicCredentialInRecord(settingsFileEnv)
}

/** Proxy / third-party Claude setups: skip ACP session resume to avoid stale default models. */
export function shouldSkipClaudeSessionResume(settingsFileEnv: Record<string, string>): boolean {
  return isClaudeModelCliLocked(settingsFileEnv)
    || !!settingsFileEnv.ANTHROPIC_BASE_URL?.trim()
    || hasAnthropicCredentialInRecord(settingsFileEnv)
}

export function maskSecret(value: string | null | undefined, visibleTail = 4): string | null {
  if (!value?.trim()) return null
  const trimmed = value.trim()
  if (trimmed.length <= visibleTail) return '****'
  return `${'*'.repeat(Math.min(8, trimmed.length - visibleTail))}${trimmed.slice(-visibleTail)}`
}

export function summarizeClaudeProvenance(settingsFileEnv: Record<string, string>): {
  model: string | null
  auth: string | null
  baseUrl: string | null
} {
  const settingsLabel = '~/.claude/settings.json'
  const model = settingsFileEnv.ANTHROPIC_MODEL?.trim()
    ? `${settingsLabel} env.ANTHROPIC_MODEL`
    : null
  const baseUrl = settingsFileEnv.ANTHROPIC_BASE_URL?.trim()
    ? `${settingsLabel} env.ANTHROPIC_BASE_URL`
    : null
  const authKey = CREDENTIAL_KEYS.find((key) => isValidAnthropicCredential(settingsFileEnv[key]))
  const auth = authKey ? `${settingsLabel} env.${authKey}` : null
  return { model, auth, baseUrl }
}

export function pickClaudeConfigSource(args: {
  settingsFileEnv: Record<string, string>
  oauthLoggedIn: boolean
  processEnvHasCredential: boolean
}): 'cli-settings' | 'cli-oauth' | 'cli-env' {
  if (hasAnthropicCredentialInRecord(args.settingsFileEnv) || isClaudeModelCliLocked(args.settingsFileEnv)) {
    return 'cli-settings'
  }
  if (args.oauthLoggedIn) return 'cli-oauth'
  if (args.processEnvHasCredential) return 'cli-env'
  return 'cli-settings'
}
