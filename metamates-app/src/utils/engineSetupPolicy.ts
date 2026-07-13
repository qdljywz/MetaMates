/** Engine onboarding lifecycle — separate from welcome / workspace wizard. */

export type EngineSetupStatus = 'pending' | 'vault_only' | 'ready'

export type EngineSetupBackendId = 'codebuddy' | 'gemini' | 'claude' | 'codex'

/** Assistants offered in the setup funnel (single pick). */
export const ENGINE_SETUP_BACKENDS: EngineSetupBackendId[] = [
  'codebuddy',
  'gemini',
  'claude',
  'codex',
]

/**
 * Default recommendation by UI language.
 * Chinese users → CodeBuddy; English → Gemini.
 */
export function getRecommendedEngineBackend(language: string): EngineSetupBackendId {
  return language.startsWith('zh') ? 'codebuddy' : 'gemini'
}

export function isEngineSetupBackend(value: string): value is EngineSetupBackendId {
  return (ENGINE_SETUP_BACKENDS as string[]).includes(value)
}

export interface EngineSetupSettingsSlice {
  engineSetupStatus?: EngineSetupStatus
  engineSetupSkippedAt?: number
  preferredAssistant?: string
  cliAgentEnabled?: Record<string, boolean>
}

/**
 * Whether the full-screen engine setup should appear.
 * @param hasUsableAgent - Installed, enabled, and detected by ACP
 */
export function shouldShowEngineSetup(params: {
  workspacePath?: string
  engineSetupStatus?: EngineSetupStatus
  hasUsableAgent: boolean
}): boolean {
  if (!params.workspacePath?.trim()) return false
  if (params.hasUsableAgent) return false
  if (params.engineSetupStatus === 'ready') return false
  if (params.engineSetupStatus === 'vault_only') return false
  return params.engineSetupStatus === 'pending'
}

const VAULT_REMINDER_SESSION_KEY = 'metamates-vault-reminder-dismissed'

/** sessionStorage key for dismissing the vault-only reminder this session. */
export function vaultReminderSessionKey(): string {
  return VAULT_REMINDER_SESSION_KEY
}

/**
 * Light reminder when user chose vault-only but has no usable assistant.
 */
export function shouldShowVaultOnlyReminder(params: {
  engineSetupStatus?: EngineSetupStatus
  hasUsableAgent: boolean
  dismissedThisSession?: boolean
}): boolean {
  if (params.dismissedThisSession) return false
  if (params.hasUsableAgent) return false
  return params.engineSetupStatus === 'vault_only'
}

/**
 * After workspace is chosen in welcome, mark engine setup as required.
 */
export function engineSetupPendingPatch(): Pick<
  EngineSetupSettingsSlice,
  'engineSetupStatus'
> {
  return { engineSetupStatus: 'pending' }
}

export function engineSetupReadyPatch(
  backend: string,
): Pick<EngineSetupSettingsSlice, 'engineSetupStatus' | 'preferredAssistant'> {
  return {
    engineSetupStatus: 'ready',
    preferredAssistant: backend,
  }
}

export function engineSetupVaultOnlyPatch(): Pick<
  EngineSetupSettingsSlice,
  'engineSetupStatus' | 'engineSetupSkippedAt'
> {
  return {
    engineSetupStatus: 'vault_only',
    engineSetupSkippedAt: Date.now(),
  }
}

/**
 * Enable a single assistant in the thinking engine panel.
 */
export function buildCliEnabledPatch(
  backend: string,
  existing?: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...(existing || {}) }
  for (const key of Object.keys(next)) {
    next[key] = key === backend
  }
  next[backend] = true
  return next
}
