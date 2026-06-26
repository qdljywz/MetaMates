/** User-configured MCP server (stdio only, injected into ACP session/new). */
export interface UserMcpServer {
  id: string
  name: string
  enabled: boolean
  command: string
  args?: string[]
  env?: Record<string, string>
  /** Built-in servers (e.g. metamates-vault) are read-only in UI */
  builtin?: boolean
}
