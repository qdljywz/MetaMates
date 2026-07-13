#!/usr/bin/env node
/**
 * Fast Claude live smoke (~30–90s): spawn ACP with same env as MetaMates, ping once.
 * No Playwright — use before slow test:e2e:claude-agent-live.
 *
 *   npm run verify:claude-ping
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = resolveDefaultWorkspace()
const PROMPT_TIMEOUT_MS = Number(process.env.VERIFY_CLAUDE_PING_MS || 90_000)

function spawnAcp(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options)
    const stderrChunks = []
    child.stderr?.on('data', (chunk) => {
      stderrChunks.push(chunk.toString())
    })
    setTimeout(() => resolve({ child, buffer: '', rid: 1, updates: [], stderrChunks }), 1200)
  })
}

function wireSessionUpdates(conn) {
  conn.child.stdout.on('data', (chunk) => {
    conn.buffer += chunk.toString()
    const lines = conn.buffer.split('\n')
    conn.buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.method === 'session/update') {
          conn.updates.push(msg.params?.update)
        }
      } catch {
        // ignore
      }
    }
  })
}

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
          if (msg.method === 'session/update') {
            conn.updates.push(msg.params?.update)
          }
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

function extractAgentText(updates) {
  const parts = []
  for (const update of updates) {
    if (!update || typeof update !== 'object') continue
    if (update.sessionUpdate === 'agent_message_chunk') {
      const text = update.content?.text ?? update.content
      if (typeof text === 'string' && text.trim()) parts.push(text)
    }
  }
  return parts.join('')
}

async function main() {
  const started = Date.now()
  console.log('\n══ Claude ping (fast live smoke) ══\n')

  const { execSync } = await import('child_process')
  execSync('npm run electron:compile', { cwd: ROOT, stdio: 'pipe' })

  const { createSpawnConfigFromResolved } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/acp/acpSpawn.cjs')).href
  )
  const { applyClaudeChildEnvOverrides, buildClaudeSessionNewPayload, getClaudeSpawnEnv } =
    await import(pathToFileURL(path.join(ROOT, 'dist-electron/claudeAuth.cjs')).href)
  const { resolveAgentRuntime } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/agentCliConfig.cjs')).href
  )
  const { acpDetector } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/acp/AcpDetector.cjs')).href
  )

  await acpDetector.initialize(true)
  const agent = acpDetector.getDetectedAgents().find((a) => a.backend === 'claude')
  if (!agent) {
    console.error('❌ Claude CLI not detected')
    process.exit(1)
  }

  const runtime = resolveAgentRuntime('claude')
  const cliModel = runtime.display.effectiveModel
  console.log(`Model: ${cliModel ?? '(default)'}  Base: ${runtime.display.effectiveBaseUrl ?? 'anthropic'}`)
  console.log(`Workspace: ${WORKSPACE}\n`)

  let { command, args, options } = createSpawnConfigFromResolved(
    agent.cliPath,
    agent.acpArgs || [],
    WORKSPACE,
    getClaudeSpawnEnv(),
  )
  if (options.env) {
    options.env = applyClaudeChildEnvOverrides(options.env)
  }

  const conn = await spawnAcp(command, args, options)
  if (!conn?.child) {
    console.error('❌ spawn failed')
    process.exit(1)
  }
  wireSessionUpdates(conn)

  try {
    await jsonRpc(
      conn,
      'initialize',
      {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      },
      45_000,
    )

    const sessionPayload = buildClaudeSessionNewPayload(WORKSPACE, [])
    const session = await jsonRpc(conn, 'session/new', sessionPayload, 45_000)
    if (!session?.sessionId) {
      console.error('❌ session/new: no sessionId')
      process.exit(1)
    }
    console.log(`✅ session/new ${session.sessionId.slice(0, 12)}`)

    if (cliModel) {
      try {
        await jsonRpc(
          conn,
          'session/set_model',
          { sessionId: session.sessionId, modelId: cliModel },
          20_000,
        )
        console.log(`✅ session/set_model ${cliModel}`)
      } catch (e) {
        console.warn(`⚠ session/set_model: ${e.message?.slice(0, 100)}`)
      }
    }

    const marker = 'PING_OK'
    const promptText = `Reply with exactly: ${marker}`
    const updatesBefore = conn.updates.length
    await jsonRpc(
      conn,
      'session/prompt',
      {
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text: promptText }],
      },
      PROMPT_TIMEOUT_MS,
    )

    const reply = extractAgentText(conn.updates.slice(updatesBefore))
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)

    if (reply.includes(marker)) {
      console.log(`✅ prompt reply contains ${marker} (${elapsed}s)`)
      console.log(`   preview: ${reply.slice(0, 80).replace(/\s+/g, ' ')}`)
      process.exit(0)
    }

    console.error(`❌ prompt finished but reply missing ${marker} (${elapsed}s)`)
    if (reply) console.error(`   got: ${reply.slice(0, 200)}`)
    const stderr = (conn.stderrChunks || []).join('').trim()
    if (stderr) console.error(`   stderr: ${stderr.slice(0, 300)}`)
    process.exit(1)
  } catch (e) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    const msg = e.message || String(e)
    if (/Arrearage|account is in good standing|overdue-payment/i.test(msg)) {
      console.error(`❌ DashScope 账户欠费/余额不足 (Arrearage) — MetaMates 配置正常，请充值阿里云百炼后再试 (${elapsed}s)`)
      process.exit(2)
    }
    console.error(`❌ ${msg.slice(0, 200)} (${elapsed}s)`)
    const stderr = (conn.stderrChunks || []).join('').trim()
    if (stderr) console.error(`stderr: ${stderr.slice(0, 400)}`)
    process.exit(1)
  } finally {
    conn.child.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
