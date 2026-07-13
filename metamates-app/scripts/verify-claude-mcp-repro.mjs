#!/usr/bin/env node
/** Repro: session/new with vault MCP vs without (isolated E2E workspace). */
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = resolveDefaultWorkspace()

function jsonRpc(conn, method, params, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const id = conn.rid++
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeoutMs)
    const onData = (chunk) => {
      conn.buffer += chunk.toString()
      const lines = conn.buffer.split('\n')
      conn.buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === id) {
            clearTimeout(timer)
            conn.child.stdout.off('data', onData)
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
            else resolve(msg.result)
          }
        } catch {
          // ignore
        }
      }
    }
    conn.child.stdout.on('data', onData)
    conn.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function trySession(label, mcpServers) {
  const { createSpawnConfigFromResolved } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/acp/acpSpawn.cjs')).href
  )
  const { applyClaudeChildEnvOverrides, buildClaudeSessionNewPayload, getClaudeSpawnEnv } =
    await import(pathToFileURL(path.join(ROOT, 'dist-electron/claudeAuth.cjs')).href)
  const { acpDetector } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/acp/AcpDetector.cjs')).href)

  await acpDetector.initialize(true)
  const agent = acpDetector.getDetectedAgents().find((a) => a.backend === 'claude')
  if (!agent) throw new Error('claude not detected')

  let { command, args, options } = createSpawnConfigFromResolved(
    agent.cliPath,
    agent.acpArgs || [],
    WORKSPACE,
    getClaudeSpawnEnv(),
  )
  if (options.env) options.env = applyClaudeChildEnvOverrides(options.env)

  const child = spawn(command, args, options)
  const stderrChunks = []
  child.stderr?.on('data', (c) => stderrChunks.push(c.toString()))
  await new Promise((r) => setTimeout(r, 1500))
  const conn = { child, buffer: '', rid: 1, stderrChunks }

  try {
    await jsonRpc(
      conn,
      'initialize',
      { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } } },
      45_000,
    )
    const payload = buildClaudeSessionNewPayload(WORKSPACE, mcpServers)
    const session = await jsonRpc(conn, 'session/new', payload, 45_000)
    console.log(`✅ ${label}: session ${session.sessionId?.slice(0, 12)} mcp=${mcpServers.length}`)
    return true
  } catch (e) {
    console.error(`❌ ${label}: ${e.message}`)
    const stderr = stderrChunks.join('').trim()
    if (stderr) console.error(`   stderr: ${stderr.slice(0, 400)}`)
    return false
  } finally {
    child.kill()
  }
}

async function main() {
  execSync('npm run electron:compile', { cwd: ROOT, stdio: 'pipe' })

  // Mock electron app for readAppSettings path — use mcp builder directly
  const { buildMetaMatesMcpServers } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/acp/mcpSessionConfig.cjs')).href
  )

  // buildMetaMatesMcpServers needs electron app — build manually from user settings
  const settings = JSON.parse(
    await import('fs').then((fs) =>
      fs.promises.readFile(
        path.join(process.env.APPDATA || '', 'metamates-app', 'settings.json'),
        'utf8',
      ),
    ),
  )
  const port = Number(settings.vaultApiPort) || 17333
  const bridgePath = path.join(ROOT, 'scripts', 'vault-mcp-bridge.mjs')
  const mcpServers = settings.vaultApiEnabled
    ? [
        {
          type: 'stdio',
          name: 'metamates-vault',
          command: 'node',
          args: [bridgePath],
          env: [{ name: 'VAULT_API_URL', value: `http://127.0.0.1:${port}` }],
        },
      ]
    : []

  console.log('Workspace:', WORKSPACE)
  console.log('MCP servers:', JSON.stringify(mcpServers, null, 2))

  const noMcp = await trySession('without MCP', [])
  const withMcp = await trySession('with vault MCP', mcpServers)
  process.exit(noMcp && withMcp ? 0 : noMcp ? 2 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
