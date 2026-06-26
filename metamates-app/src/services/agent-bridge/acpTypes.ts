import {
  getAcpArgsForBackend,
  PERSONAL_RUNTIME_BACKENDS,
  POTENTIAL_ACP_CLIS,
  getInstallCommandsForBackend,
  getUninstallPackageForBackend,
} from '@acp-registry'

export type AcpBackend =
  | (typeof POTENTIAL_ACP_CLIS)[number]['backendId']
  | 'custom'
  | 'ollama'

export interface AcpBackendConfig {
  name: string
  cliCommand?: string
  acpArgs?: string[]
  enabled: boolean
  description?: string
  installCommands?: string[]
  npmPackage?: string
  installUrl?: string
  isBuiltIn?: boolean
  isDefault?: boolean
}

function runtimeBackendConfig(def: (typeof POTENTIAL_ACP_CLIS)[number]): AcpBackendConfig {
  return {
    name: def.name,
    cliCommand: def.cmd,
    acpArgs: def.args,
    enabled: true,
    description: def.description,
    installCommands: getInstallCommandsForBackend(def.backendId),
    npmPackage: getUninstallPackageForBackend(def.backendId),
    isDefault: def.isDefault,
    installUrl: def.installUrl,
  }
}

const runtimeBackends = Object.fromEntries(
  POTENTIAL_ACP_CLIS.filter((d) => d.detectByDefault).map((d) => [d.backendId, runtimeBackendConfig(d)])
) as Record<string, AcpBackendConfig>

export const ACP_BACKENDS: Record<AcpBackend, AcpBackendConfig> = {
  ...runtimeBackends,
  custom: {
    name: 'Custom Agent',
    enabled: true,
    description: 'User-configured custom agent',
  },
  ollama: {
    name: 'Ollama (Local)',
    enabled: true,
    description: 'Local Ollama models via ACP bridge',
    isBuiltIn: true,
  },
} as Record<AcpBackend, AcpBackendConfig>

export interface PotentialAcpCli {
  cmd: string
  args: string[]
  name: string
  backendId: AcpBackend
}

export function getPotentialAcpClis(): PotentialAcpCli[] {
  return PERSONAL_RUNTIME_BACKENDS
    .map((id) => ACP_BACKENDS[id as AcpBackend])
    .filter((config) => config?.cliCommand)
    .map((config) => {
      const id = PERSONAL_RUNTIME_BACKENDS.find((bid) => ACP_BACKENDS[bid as AcpBackend] === config)!
      return {
        cmd: config.cliCommand!,
        args: config.acpArgs || getAcpArgsForBackend(id),
        name: config.name,
        backendId: id as AcpBackend,
      }
    })
}

export interface AcpMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface AcpSessionUpdate {
  sessionId: string
  update: {
    sessionUpdate: string
    content?: { text: string }
    [key: string]: unknown
  }
}

export interface AcpPermissionRequest {
  toolCall: {
    toolCallId: string
    title?: string
    rawInput?: { description?: string }
  }
  options: AcpPermissionOption[]
}

export interface AcpPermissionOption {
  optionId: string
  name: string
}

export interface AcpModelInfo {
  source: string
  currentModelId: string
  currentModelLabel: string
  canSwitch: boolean
  availableModels: Array<{ id: string; label: string }>
}

export interface AcpDetectedAgent {
  backend: AcpBackend
  name: string
  cliPath?: string
  acpArgs?: string[]
  available: boolean
}
