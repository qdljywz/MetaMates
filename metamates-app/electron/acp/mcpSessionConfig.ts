import * as fs from 'fs'
import { readAppSettings } from '../appSettings'
import { getNodeLikeRuntime, resolveBundledScript } from '../shared/appPaths'
import { vaultApiServer } from '../vaultApi/server'

/** Stdio MCP entry for ACP session/new — do NOT set type (claude-agent-acp ignores type:'stdio'). */
export interface AcpSessionMcpServerStdio {
  name: string
  command: string
  args?: string[]
  env?: Array<{ name: string; value: string }>
}

export interface UserMcpServerConfig {
  id: string
  name: string
  enabled: boolean
  command: string
  args?: string[]
  env?: Record<string, string>
  builtin?: boolean
}

function envRecordToAcp(env?: Record<string, string>): Array<{ name: string; value: string }> | undefined {
  if (!env || !Object.keys(env).length) return undefined
  return Object.entries(env).map(([name, value]) => ({ name, value }))
}

function userServerToAcp(server: UserMcpServerConfig): AcpSessionMcpServerStdio | null {
  if (!server.enabled || !server.command?.trim()) return null
  return {
    name: server.name || server.id,
    command: server.command.trim(),
    args: server.args?.length ? server.args : undefined,
    env: envRecordToAcp(server.env),
  }
}

function buildVaultMcpServer(port: number): AcpSessionMcpServerStdio | null {
  const bridgePath = resolveBundledScript('vault-mcp-bridge.mjs')
  if (!bridgePath) return null

  const runtime = getNodeLikeRuntime()
  return {
    name: 'metamates-vault',
    command: runtime.command,
    args: [bridgePath],
    env: [
      ...runtime.extraEnv,
      { name: 'VAULT_API_URL', value: `http://127.0.0.1:${port}` },
    ],
  }
}

/** Build MCP servers to inject into ACP session/new (AionUi-compatible stdio shape). */
export function buildMetaMatesMcpServers(): AcpSessionMcpServerStdio[] {
  const settings = readAppSettings()
  const servers: AcpSessionMcpServerStdio[] = []
  const userServers = (settings.mcpServers as UserMcpServerConfig[] | undefined) || []

  for (const user of userServers) {
    if (user.builtin) continue
    const mapped = userServerToAcp(user)
    if (mapped) servers.push(mapped)
  }

  if (settings.vaultApiEnabled) {
    const vaultStatus = vaultApiServer.getStatus()
    if (!vaultStatus.running) {
      console.warn('[MCP] Vault API not running — omitting metamates-vault from session/new (avoids Claude ACP crash)')
    } else {
      const vaultServer = buildVaultMcpServer(vaultStatus.port)
      if (vaultServer) servers.push(vaultServer)
    }
  }

  return servers
}

/** MCP list for settings UI (includes builtin vault entry when enabled). */
export function getMcpServersForSettings(): UserMcpServerConfig[] {
  const settings = readAppSettings()
  const userServers = ((settings.mcpServers as UserMcpServerConfig[] | undefined) || []).filter((s) => !s.builtin)
  const list = [...userServers]

  if (settings.vaultApiEnabled) {
    const port = Number(settings.vaultApiPort) || 17333
    const runtime = getNodeLikeRuntime()
    list.unshift({
      id: 'metamates-vault',
      name: 'MetaMates Vault',
      enabled: true,
      command: runtime.command,
      args: ['scripts/vault-mcp-bridge.mjs'],
      env: {
        ...Object.fromEntries(runtime.extraEnv.map(({ name, value }) => [name, value])),
        VAULT_API_URL: `http://127.0.0.1:${port}`,
      },
      builtin: true,
    })
  }

  return list
}
