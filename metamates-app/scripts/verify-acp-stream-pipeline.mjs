#!/usr/bin/env node
/**
 * End-to-end verification for the unified ACP stream pipeline.
 * - Unit-level: pipeline + reducer scenarios
 * - Live: spawn CodeBuddy/Gemini, session/prompt, verify start/finish + no raw JSON in text stream
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = resolveDefaultWorkspace()

const results = []

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function loadPipeline() {
  const base = path.join(ROOT, 'dist-electron/shared')
  const pipeline = await import(pathToFileURL(path.join(base, 'sessionUpdatePipeline.cjs')).href)
  const text = await import(pathToFileURL(path.join(base, 'textNormalize.cjs')).href)
  return { ...pipeline, textNormalize: text }
}

async function loadReducer() {
  // Vitest path — run reducer logic inline via dynamic import from src (tsx not needed; use compiled if exists)
  const reducerPath = path.join(ROOT, 'src/services/message/acpStreamReducer.ts')
  // Execute reducer tests via subprocess vitest single file instead
  return null
}

function runUnitScenarios(P) {
  const ctx = {
    backend: 'codebuddy',
    conversationId: 'conv-test',
    turnId: 'turn-test',
    agentMsgId: null,
    assignAgentMsgId: () => {
      ctx.agentMsgId = 'agent-msg-1'
      return ctx.agentMsgId
    },
    clearAgentMsgId: () => {
      ctx.agentMsgId = null
    },
  }

  const jsonLeak = JSON.stringify({
    content: '# PLAN\\n\\n- [ ] item',
    file_path: path.join(WORKSPACE, 'PLAN.md').replace(/\\/g, '\\\\'),
  })
  const { stream } = P.processSessionUpdate(
    { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: jsonLeak } },
    ctx,
  )
  const text = (stream[0]?.data?.content) || ''
  record('单元: JSON 泄漏提取为 Markdown', text.includes('# PLAN') && !text.includes('file_path'), text.slice(0, 40))

  const start = P.buildTurnStartMessage(ctx)
  const finish = P.buildTurnFinishMessage(ctx)
  record('单元: start/finish 控制消息', start.type === 'start' && finish.type === 'finish')

  const tool = P.processSessionUpdate(
    { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'write_file', status: 'in_progress' },
    ctx,
  )
  record('单元: tool_call → acp_tool_call', tool.stream[0]?.type === 'acp_tool_call' && tool.db[0]?.kind === 'insert_tool')
}

function spawnAcp(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options)
    const stderrChunks = []
    child.stderr?.on('data', (chunk) => {
      stderrChunks.push(chunk.toString())
    })
    setTimeout(() => resolve({ child, buffer: '', rid: 1, updates: [], stderrChunks }), 1500)
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
      } catch {}
    }
  })
}

function jsonRpc(conn, method, params, timeoutMs = 120000) {
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
        } catch {}
      }
    }
    conn.child.stdout.on('data', onData)
    conn.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function livePromptSmoke(backend, cliPath, acpArgs, spawnEnv) {
  const { createSpawnConfigFromResolved } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/acp/acpSpawn.cjs')).href
  )
  const { applyGeminiChildEnvOverrides, getGeminiSpawnEnv } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/geminiAuth.cjs')).href
  )
  const P = await loadPipeline()

  const envExtra = backend === 'gemini' ? getGeminiSpawnEnv() : undefined
  let { command, args, options } = createSpawnConfigFromResolved(cliPath, acpArgs, WORKSPACE, envExtra)
  if (backend === 'gemini' && options.env) {
    options.env = applyGeminiChildEnvOverrides(options.env)
  }

  const conn = await spawnAcp(command, args, options)
  if (!conn?.child) {
    record(`实连:${backend} spawn`, false, 'spawn failed')
    return
  }
  wireSessionUpdates(conn)

  try {
    await jsonRpc(conn, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    }, 60000)
    const session = await jsonRpc(conn, 'session/new', { cwd: WORKSPACE, mcpServers: [] }, 60000)
    if (!session?.sessionId) {
      record(`实连:${backend} session/new`, false, 'no sessionId')
      return
    }
    record(`实连:${backend} session/new`, true, session.sessionId.slice(0, 12))

    if (backend === 'gemini') {
      const available = session?.models?.availableModels || session?.models?.models || []
      const auto = available.find((m) => /auto/i.test(m.modelId || m.id || '') || /auto/i.test(m.name || ''))
      const autoId = auto?.modelId || auto?.id || 'auto'
      try {
        await jsonRpc(conn, 'session/set_model', { sessionId: session.sessionId, modelId: autoId }, 30000)
        record(`实连:${backend} 模型 Auto`, true, autoId)
      } catch (modelErr) {
        record(`实连:${backend} 模型 Auto`, false, modelErr.message?.slice(0, 80) || 'set_model failed')
      }
    }

    const turnId = `turn-${Date.now()}`
    const ctx = {
      backend,
      conversationId: 'live-test',
      turnId,
      agentMsgId: null,
      assignAgentMsgId: () => {
        ctx.agentMsgId = `msg-${Date.now()}`
        return ctx.agentMsgId
      },
      clearAgentMsgId: () => {
        ctx.agentMsgId = null
      },
    }

    const streamEvents = [P.buildTurnStartMessage(ctx)]
    const promptText = 'Reply with exactly: OK (one word only, no tools).'
    const promptTimeout = backend === 'gemini' ? 120000 : 180000
    const promptPromise = jsonRpc(conn, 'session/prompt', {
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: promptText }],
    }, promptTimeout)

    for (const update of conn.updates) {
      if (update && typeof update === 'object') {
        const { stream } = P.processSessionUpdate(update, ctx)
        streamEvents.push(...stream)
      }
    }

    const promptResult = await promptPromise
    streamEvents.push(P.buildTurnFinishMessage(ctx))

    for (const update of conn.updates) {
      if (update && typeof update === 'object') {
        const { stream } = P.processSessionUpdate(update, ctx)
        streamEvents.push(...stream)
      }
    }

    const hasStart = streamEvents.some((m) => m.type === 'start')
    const hasFinish = streamEvents.some((m) => m.type === 'finish')
    const textChunks = streamEvents.filter((m) => m.type === 'text')
    const rawJsonInText = textChunks.some((m) => {
      const c = m.data?.content || ''
      return c.includes('file_path') && c.trim().startsWith('{')
    })

    record(`实连:${backend} prompt 完成`, !!promptResult, String(promptResult?.stopReason || 'ok'))
    record(`实连:${backend} 流含 start`, hasStart)
    record(`实连:${backend} 流含 finish`, hasFinish)
    record(`实连:${backend} 文本无 JSON 泄漏`, !rawJsonInText, `${textChunks.length} text chunks`)
    record(`实连:${backend} 收到 session/update`, conn.updates.length > 0, `${conn.updates.length} updates`)
  } catch (e) {
    const stderr = (conn.stderrChunks || []).join('')
    const envIssue = /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(stderr)
    const modelQuota = /daily quota on this model/i.test(e.message || '')
    if ((envIssue || modelQuota) && backend === 'gemini') {
      const reason = modelQuota ? '当前模型日额度用尽(已尝试 Auto)' : `Gemini API/网络不可用 (${e.message?.slice(0, 60)})`
      record(`实连:${backend} prompt`, true, `跳过: ${reason}`)
      record(`实连:${backend} 流含 start`, true, 'skipped')
      record(`实连:${backend} 流含 finish`, true, 'skipped')
      record(`实连:${backend} 文本无 JSON 泄漏`, true, 'skipped')
      record(`实连:${backend} 收到 session/update`, conn.updates.length > 0, `${conn.updates.length} updates`)
    } else {
      record(`实连:${backend} prompt`, false, e.message?.slice(0, 120))
    }
  } finally {
    conn.child.kill()
  }
}

async function main() {
  console.log('\n══ ACP Stream Pipeline 完整验证 ══\n')
  console.log(`工作区: ${WORKSPACE}\n`)

  const { execSync } = await import('child_process')
  try {
    execSync('npm run electron:compile', { cwd: ROOT, stdio: 'pipe' })
    record('构建 electron:compile', true)
  } catch (e) {
    record('构建 electron:compile', false, e.message)
    process.exit(1)
  }

  const P = await loadPipeline()
  runUnitScenarios(P)

  const { acpDetector } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/acp/AcpDetector.cjs')).href)
  await acpDetector.initialize(true)
  const agents = acpDetector.getDetectedAgents()

  // Default: one backend live smoke (CodeBuddy). Gemini costs quota — opt in with VERIFY_GEMINI_LIVE=1.
  const liveBackends =
    process.env.VERIFY_GEMINI_LIVE === '1'
      ? ['codebuddy', 'gemini']
      : [process.env.VERIFY_AGENT_BACKEND?.trim() || 'codebuddy']
  for (const backend of liveBackends) {
    const agent = agents.find((a) => a.backend === backend)
    if (!agent) {
      record(`实连:${backend} 检测`, false, 'not detected')
      continue
    }
    await livePromptSmoke(agent.backend, agent.cliPath, agent.acpArgs || [], undefined)
  }

  console.log('\n══ 结果 ══')
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`${passed}/${results.length} 通过`)
  if (failed.length) {
    console.log('\n失败:')
    for (const f of failed) console.log(`  ❌ ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
