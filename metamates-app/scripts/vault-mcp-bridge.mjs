#!/usr/bin/env node
/**
 * MetaMates Vault MCP Bridge (stdio)
 *
 * 将 MetaMates Vault HTTP API 暴露为 MCP 工具，供 Claude Desktop / Cursor 连接。
 *
 * 前置条件：在 MetaMates 设置中启用 Vault API，或手动启动 API 服务。
 *
 * 环境变量：
 *   VAULT_API_URL - 默认 http://127.0.0.1:17333
 *
 * Claude Desktop 配置示例 (claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "metamates-vault": {
 *       "command": "node",
 *       "args": ["path/to/metamates-app/scripts/vault-mcp-bridge.mjs"],
 *       "env": { "VAULT_API_URL": "http://127.0.0.1:17333" }
 *     }
 *   }
 * }
 */

const VAULT_API_URL = process.env.VAULT_API_URL || 'http://127.0.0.1:17333'

const TOOLS = [
  {
    name: 'search_vault',
    description: 'Search markdown notes in the MetaMates workspace by keyword',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_vault_semantic',
    description: 'Semantic (TF-IDF) search markdown notes in the MetaMates workspace',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Get calendar events for today or a specific date from iCal (.ics)',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD), defaults to today' },
      },
    },
  },
  {
    description: 'Read a markdown note by absolute or workspace-relative path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_note',
    description: 'Write or update a markdown note',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Markdown content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_notes',
    description: 'List all markdown notes in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        recursive: { type: 'boolean', description: 'Include subdirectories (default true)' },
      },
    },
  },
]

async function vaultFetch(pathname, options = {}) {
  const url = `${VAULT_API_URL}${pathname}`
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vault API ${res.status}: ${text}`)
  }
  return res.json()
}

async function callTool(name, args) {
  switch (name) {
    case 'search_vault': {
      const q = encodeURIComponent(args.query || '')
      const limit = args.limit || 10
      const data = await vaultFetch(`/api/search?q=${q}&limit=${limit}`)
      return JSON.stringify(data.results, null, 2)
    }
    case 'search_vault_semantic': {
      const q = encodeURIComponent(args.query || '')
      const limit = args.limit || 10
      const data = await vaultFetch(`/api/search/semantic?q=${q}&limit=${limit}`)
      return JSON.stringify(data.results, null, 2)
    }
    case 'get_calendar_events': {
      const dateParam = args.date ? `&date=${encodeURIComponent(args.date)}` : ''
      const data = await vaultFetch(`/api/calendar?${dateParam.replace(/^&/, '')}`)
      return JSON.stringify(data, null, 2)
    }
    case 'read_note': {
      const p = encodeURIComponent(args.path)
      const data = await vaultFetch(`/api/file?path=${p}`)
      return data.content
    }
    case 'write_note': {
      const data = await vaultFetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: args.path, content: args.content }),
      })
      return JSON.stringify(data)
    }
    case 'list_notes': {
      const recursive = args.recursive !== false
      const data = await vaultFetch(`/api/list?recursive=${recursive}`)
      return JSON.stringify(data.files, null, 2)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

process.stdin.setEncoding('utf8')
let buffer = ''

process.stdin.on('data', (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue
    void handleMessage(JSON.parse(line))
  }
})

async function handleMessage(msg) {
  const { id, method, params } = msg

  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'metamates-vault', version: '1.0.0' },
        },
      })
      return
    }

    if (method === 'notifications/initialized') {
      return
    }

    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
      return
    }

    if (method === 'tools/call') {
      const text = await callTool(params.name, params.arguments || {})
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text }],
        },
      })
      return
    }

    if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} })
      return
    }

    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    })
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: error.message || String(error) },
    })
  }
}
