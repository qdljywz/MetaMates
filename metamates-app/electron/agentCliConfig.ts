/**
 * Unified agent CLI runtime resolver — single source for spawn env, UI, and capabilities.
 */

import * as os from 'os'
import * as path from 'path'

import {
  getClaudeAuthHint,
  getClaudePreferredModelId,
  getClaudeSpawnEnv,
  isClaudeAuthenticated,
  readClaudeSettingsEnv,
  shouldUseClaudeEnvModel,
} from './claudeAuth'
import { isCliCommandAvailable } from './cliDetection'
import {
  hasAnthropicCredentialInRecord,
  isClaudeModelCliLocked,
  isClaudeModelPickerLocked,
  pickClaudeConfigSource,
  shouldSkipClaudeSessionResume,
  summarizeClaudeProvenance,
} from './shared/agentCliConfigPolicy'
import type { AgentRuntimeSnapshot } from './shared/agentRuntimeTypes'
import { describeGeminiAuthSource, getGeminiAuthHint, getGeminiSpawnEnv, isGeminiAuthenticated } from './geminiAuth'
import { getDetectionCommands, getRegistryCli } from './shared/acpRegistry'
import { getEnhancedEnv } from './shellEnv'

const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude')

function isBackendCliInstalled(backend: string): boolean {
  const def = getRegistryCli(backend)
  if (!def) return isCliCommandAvailable(backend)
  return getDetectionCommands(def).some((cmd) => isCliCommandAvailable(cmd))
}

function resolveClaudeRuntime(): AgentRuntimeSnapshot {
  const settingsFileEnv = readClaudeSettingsEnv()
  const spawnEnv = getClaudeSpawnEnv()
  const processEnv = getEnhancedEnv()
  const oauthLoggedIn = isClaudeAuthenticated() && !hasAnthropicCredentialInRecord(settingsFileEnv)
    && !hasAnthropicCredentialInRecord(processEnv as Record<string, string | undefined>)
  const provenance = summarizeClaudeProvenance(settingsFileEnv)
  const modelLocked = isClaudeModelCliLocked(settingsFileEnv)
  const effectiveModel = getClaudePreferredModelId()
  const effectiveBaseUrl = spawnEnv.ANTHROPIC_BASE_URL?.trim() || null
  const authOk = isClaudeAuthenticated()
  const authMethod = hasAnthropicCredentialInRecord(settingsFileEnv)
    ? 'env'
    : authOk
      ? 'oauth'
      : 'missing'

  return {
    backend: 'claude',
    cliInstalled: isCliCommandAvailable('claude'),
    source: pickClaudeConfigSource({
      settingsFileEnv,
      oauthLoggedIn,
      processEnvHasCredential: hasAnthropicCredentialInRecord(processEnv as Record<string, string | undefined>),
    }),
    spawnEnv,
    display: {
      effectiveModel,
      effectiveBaseUrl,
      authOk,
      authMethod,
      authHint: authOk ? '' : getClaudeAuthHint(),
      provenanceModel: modelLocked ? provenance.model : (effectiveModel ? provenance.model ?? '~/.claude or process env' : null),
      provenanceAuth: provenance.auth ?? (authMethod === 'oauth' ? 'claude auth login' : null),
      provenanceBaseUrl: provenance.baseUrl,
      settingsPath: path.join(CLAUDE_SETTINGS_DIR, 'settings.json'),
    },
    capabilities: {
      canSwitchModel: !isClaudeModelPickerLocked(settingsFileEnv),
      canSwitchMode: true,
      skipSessionResume: shouldSkipClaudeSessionResume(settingsFileEnv) || shouldUseClaudeEnvModel(),
    },
  }
}

function resolveGeminiRuntime(): AgentRuntimeSnapshot {
  const spawnEnv = getGeminiSpawnEnv()
  const authOk = isGeminiAuthenticated()
  const authSource = describeGeminiAuthSource()
  return {
    backend: 'gemini',
    cliInstalled: isBackendCliInstalled('gemini'),
    source: authSource.method === 'metamates-key' ? 'metamates' : authOk ? 'cli-settings' : 'metamates',
    spawnEnv,
    display: {
      effectiveModel: null,
      effectiveBaseUrl: null,
      authOk,
      authMethod: authSource.method,
      authHint: authOk ? '' : getGeminiAuthHint(),
      provenanceModel: null,
      provenanceAuth: authSource.provenanceAuth,
      provenanceBaseUrl: null,
      settingsPath: path.join(os.homedir(), '.gemini', 'settings.json'),
    },
    capabilities: {
      canSwitchModel: true,
      canSwitchMode: true,
      skipSessionResume: false,
    },
  }
}

function resolveDefaultRuntime(backend: string): AgentRuntimeSnapshot {
  return {
    backend,
    cliInstalled: isBackendCliInstalled(backend),
    source: 'acp-default',
    spawnEnv: {},
    display: {
      effectiveModel: null,
      effectiveBaseUrl: null,
      authOk: isBackendCliInstalled(backend),
      authMethod: isBackendCliInstalled(backend) ? 'oauth' : 'missing',
      authHint: isBackendCliInstalled(backend) ? '' : `${backend} CLI 未安装`,
      provenanceModel: null,
      provenanceAuth: null,
      provenanceBaseUrl: null,
      settingsPath: null,
    },
    capabilities: {
      canSwitchModel: true,
      canSwitchMode: true,
      skipSessionResume: false,
    },
  }
}

/** Resolve runtime config for one backend. */
export function resolveAgentRuntime(backend: string): AgentRuntimeSnapshot {
  if (backend === 'claude') return resolveClaudeRuntime()
  if (backend === 'gemini') return resolveGeminiRuntime()
  return resolveDefaultRuntime(backend)
}

/** Safe snapshot for renderer — strip spawn env secrets. */
export function resolveAgentRuntimeForRenderer(backend: string): Omit<AgentRuntimeSnapshot, 'spawnEnv'> {
  const { spawnEnv: _spawnEnv, ...rest } = resolveAgentRuntime(backend)
  return rest
}

export function resolveAllAgentRuntimesForRenderer(
  backends: string[] = ['claude', 'gemini', 'codebuddy', 'codex'],
): Array<Omit<AgentRuntimeSnapshot, 'spawnEnv'>> {
  return backends.map((backend) => resolveAgentRuntimeForRenderer(backend))
}
