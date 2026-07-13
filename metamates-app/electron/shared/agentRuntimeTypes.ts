/**
 * Agent runtime config — single snapshot for spawn, UI, and health.
 * Shared between Electron main and renderer (types only).
 */

export type AgentConfigSource = 'cli-settings' | 'cli-oauth' | 'cli-env' | 'metamates' | 'acp-default'

export type AgentAuthMethod = 'env' | 'oauth' | 'metamates-key' | 'missing'

export interface AgentRuntimeSnapshot {
  backend: string
  cliInstalled: boolean
  source: AgentConfigSource
  /** Env injected into ACP child spawn (secrets included — main process only). */
  spawnEnv: Record<string, string>
  /** Safe fields for renderer display. */
  display: {
    effectiveModel: string | null
    effectiveBaseUrl: string | null
    authOk: boolean
    authMethod: AgentAuthMethod
    authHint: string
    provenanceModel: string | null
    provenanceAuth: string | null
    provenanceBaseUrl: string | null
    settingsPath: string | null
  }
  capabilities: {
    canSwitchModel: boolean
    canSwitchMode: boolean
    skipSessionResume: boolean
  }
}
