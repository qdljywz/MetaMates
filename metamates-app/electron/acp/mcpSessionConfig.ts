import * as fs from 'fs'
import * as path from 'path'
import { readAppSettings } from '../appSettings'

export interface AcpSessionMcpServerStdio {
  type: 'stdio'
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
    type: 'stdio',
    name: server.name || server.id,
    command: server.command.trim(),
    args: server.args?.length ? server.args : undefined,
    env: envRecordToAcp(server.env),
  }
}

/** Build MCP servers to inject into ACP session/new (AionUi-compatible stdio shape). */
export function buildMetamatesMcpServers(): AcpSessionMcpServerStdio[] {
  const settings = readAppSettings()
  const servers: AcpSessionMcpServerStdio[] = []
  const userServers = (settings.mcpServers as UserMcpServerConfig[] | undefined) || []

  for (const user of userServers) {
    if (user.builtin) continue
    const mapped = userServerToAcp(user)
    if (mapped) servers.push(mapped)
  }

  if (settings.vaultApiEnabled) {
    const bridgePath = path.join(__dirname, '..', '..', 'scripts', 'vault-mcp-bridge.mjs')
    if (fs.existsSync(bridgePath)) {
      const port = settings.vaultApiPort || 17333
      servers.push({
        type: 'stdio',
        name: 'metamates-vault',
        command: 'node',
        args: [bridgePath],
        env: [{ name: 'VAULT_API_URL', value: `http://127.0.0.1:${port}` }],
      })
    }
  }

  return servers
}

/** MCP list for settings UI (includes builtin vault entry when enabled). */
export function getMcpServersForSettings(): UserMcpServerConfig[] {
  const settings = readAppSettings()
  const userServers = ((settings.mcpServers as UserMcpServerConfig[] | undefined) || []).filter(s => !s.builtin)
  const list = [...userServers]

  if (settings.vaultApiEnabled) {
    const port = settings.vaultApiPort || 17333
    list.unshift({
      id: 'metamates-vault',
      name: 'Metamates Vault',
      enabled: true,
      command: 'node',
      args: ['scripts/vault-mcp-bridge.mjs'],
      env: { VAULT_API_URL: `http://127.0.0.1:${port}` },
      builtin: true,
    })
  }

  return list
}
