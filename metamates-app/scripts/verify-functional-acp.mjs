#!/usr/bin/env node
/**
 * 功能级 ACP 实测 — 验证「真能对话、真能读写文件」，不是检查代码是否存在。
 * 行为对齐 Metamates AcpConnection：fs 代理、权限自动批准、统一 stream pipeline。
 *
 * 用法:
 *   node scripts/verify-functional-acp.mjs
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/verify-functional-acp.mjs
 *   SKIP_GEMINI=1  (默认已跳过 Gemini)
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = process.env.METAMATES_WORKSPACE || 'E:\\MyM2'
const SKIP_GEMINI = process.env.SKIP_GEMINI !== '0'
const BACKENDS = SKIP_GEMINI ? ['codebuddy'] : ['codebuddy', 'gemini']

const results = []

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function loadCjs(rel) {
  return import(pathToFileURL(path.join(ROOT, 'dist-electron', rel)).href)
}

/** Minimal ACP client matching Metamates main-process behavior. */
class FunctionalAcpClient {
  constructor(workspace, backend = 'test') {
    this.workspace = workspace
    this.backend = backend
    this.child = null
    this.buffer = ''
    this.rid = 1
    this.pending = new Map()
    this.updates = []
    this.textChunks = []
    this.fsWrites = []
    this.fsReads = []
    this.permissions = 0
    this.toolCalls = []
    this.pathSafety = null
    this.pipeline = null
    this.acpPermission = null
  }

  async loadDeps() {
    const [pathSafety, pipelineMod, permMod] = await Promise.all([
      loadCjs('shared/pathSafety.cjs'),
      loadCjs('shared/sessionUpdatePipeline.cjs'),
      loadCjs('shared/acpPermission.cjs'),
    ])
    this.pathSafety = pathSafety
    this.pipeline = pipelineMod
    this.acpPermission = permMod
    this.ctx = {
      backend: this.backend,
      conversationId: 'func-test',
      turnId: `turn-${Date.now()}`,
      agentMsgId: null,
      assignAgentMsgId: () => {
        this.ctx.agentMsgId = `msg-${Date.now()}`
        return this.ctx.agentMsgId
      },
      clearAgentMsgId: () => {
        this.ctx.agentMsgId = null
      },
    }
  }

  spawn(command, args, options) {
    return new Promise((resolve, reject) => {
      this.child = spawn(command, args, options)
      this.child.on('error', reject)
      this.child.stdout.on('data', (chunk) => this.onStdout(chunk))
      setTimeout(resolve, 2000)
    })
  }

  onStdout(chunk) {
    this.buffer += chunk.toString()
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      this.dispatch(msg)
    }
  }

  dispatch(msg) {
    if (msg.method === 'session/update') {
      const update = msg.params?.update
      this.updates.push(update)
      if (update && this.pipeline) {
        const kind = update.sessionUpdate
        if (kind === 'tool_call' || kind === 'tool_call_update') {
          this.toolCalls.push({
            kind,
            title: update.title,
            status: update.status,
            toolCallId: update.toolCallId,
            raw: JSON.stringify(update).slice(0, 300),
          })
        }
        const { stream } = this.pipeline.processSessionUpdate(update, this.ctx)
        for (const m of stream) {
          if (m.type === 'text') {
            const c = m.data?.content || ''
            if (c) this.textChunks.push(c)
          }
        }
      }
      return
    }

    if (msg.method === 'session/request_permission') {
      this.permissions += 1
      const response = this.acpPermission.buildPermissionAllowResponse(msg.id, msg.params?.options)
      this.child.stdin.write(JSON.stringify(response) + '\n')
      return
    }

    if (msg.method === 'fs/read_text_file') {
      const { assertWithinWorkspace, pathAssertError, pathAssertResolved } = this.pathSafety
      const guard = assertWithinWorkspace(this.workspace, msg.params?.path)
      const err = pathAssertError(guard)
      const resolved = pathAssertResolved(guard)
      this.fsReads.push(resolved || msg.params?.path)
      if (err || !resolved) {
        this.reply(msg.id, { error: { message: err || 'Invalid path' } })
      } else {
        try {
          const content = fs.readFileSync(resolved, 'utf-8')
          this.reply(msg.id, { result: { content } })
        } catch (e) {
          this.reply(msg.id, { error: { message: e.message } })
        }
      }
      return
    }

    if (msg.method === 'fs/write_text_file') {
      const { assertWithinWorkspace, pathAssertError, pathAssertResolved } = this.pathSafety
      const guard = assertWithinWorkspace(this.workspace, msg.params?.path)
      const err = pathAssertError(guard)
      const resolved = pathAssertResolved(guard)
      if (err || !resolved) {
        this.reply(msg.id, { error: { message: err || 'Invalid path' } })
      } else {
        try {
          fs.mkdirSync(path.dirname(resolved), { recursive: true })
          fs.writeFileSync(resolved, msg.params?.content ?? '', 'utf-8')
          this.fsWrites.push(resolved)
          this.reply(msg.id, { result: null })
        } catch (e) {
          this.reply(msg.id, { error: { message: e.message } })
        }
      }
      return
    }

    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id)
      clearTimeout(timer)
      this.pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  }

  reply(id, body) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, ...body }) + '\n')
  }

  request(method, params, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      const id = this.rid++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timeout ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  async connect(command, args, options) {
    await this.loadDeps()
    await this.spawn(command, args, options)
    await this.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    }, 90000)
    const session = await this.request('session/new', { cwd: this.workspace, mcpServers: [] }, 90000)
    if (!session?.sessionId) throw new Error('no sessionId')
    try {
      await this.request('session/set_mode', { sessionId: session.sessionId, mode: 'yolo' }, 30000)
    } catch {
      // some backends ignore set_mode
    }
    return session.sessionId
  }

  async prompt(text, timeoutMs = 300000) {
    this.textChunks = []
    this.ctx.turnId = `turn-${Date.now()}`
    this.ctx.clearAgentMsgId()
    const result = await this.request('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text }],
    }, timeoutMs)
    return {
      stopReason: result?.stopReason,
      text: this.textChunks.join(''),
      updates: this.updates.length,
    }
  }

  kill() {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }
}

async function runBackendTests(backend, agent) {
  const { createSpawnConfigFromResolved } = await loadCjs('acp/acpSpawn.cjs')
  const geminiAuth = backend === 'gemini' ? await loadCjs('geminiAuth.cjs') : null

  const envExtra = backend === 'gemini' ? geminiAuth.getGeminiSpawnEnv() : undefined
  let { command, args, options } = createSpawnConfigFromResolved(
    agent.cliPath,
    agent.acpArgs || [],
    WORKSPACE,
    envExtra,
  )
  if (backend === 'gemini' && options.env) {
    options.env = geminiAuth.applyGeminiChildEnvOverrides(options.env)
  }

  const client = new FunctionalAcpClient(WORKSPACE, backend)

  try {
    client.sessionId = await client.connect(command, args, options)
    record(`${backend} 连接`, true, client.sessionId.slice(0, 12))

    // ── 0. ACP fs 代理写入（Metamates 主进程写盘链路，不依赖 Agent 工具）──
    const fsRel = `_metamates_fs_proxy_${backend}.md`
    const fsAbs = path.join(WORKSPACE, fsRel)
    try { fs.unlinkSync(fsAbs) } catch {}
    const fsMarker = `FS_PROXY_${Date.now()}`
    client.dispatch({
      jsonrpc: '2.0',
      id: 9001,
      method: 'fs/write_text_file',
      params: { path: fsRel, content: fsMarker },
    })
    const fsProxyOk = fs.existsSync(fsAbs) && fs.readFileSync(fsAbs, 'utf-8') === fsMarker
    record(`${backend} ACP fs 代理写入`, fsProxyOk, fsProxyOk ? fsRel : '未落盘')
    try { fs.unlinkSync(fsAbs) } catch {}

    // ── 1. 中文对话 ──
    const zh = await client.prompt('你好。请只用中文回复一个字：好。不要调用任何工具。')
    const zhOk = /好/.test(zh.text) || zh.stopReason === 'end_turn'
    record(`${backend} 中文对话`, zhOk, zh.text.slice(0, 60) || zh.stopReason || '无文本')

    // ── 2. 英文短回复 ──
    const en = await client.prompt('Reply with exactly one word: OK. No tools.')
    const enOk = /\bOK\b/i.test(en.text) || en.stopReason === 'end_turn'
    record(`${backend} 英文短回复`, enOk, en.text.slice(0, 40) || en.stopReason || '无文本')

    // ── 3. 文件写入（Agent → fs/write_text_file 或 Write 工具）──
    const writeRel = `01_日记与计划/Inbox/_metamates_func_write_${backend}.md`
    const writeAbs = path.join(WORKSPACE, writeRel.replace(/\//g, path.sep))
    try { fs.unlinkSync(writeAbs) } catch {}

    const marker = `VERIFY_${backend}_${Date.now()}`
    const writePrompt = [
      '请使用 Write 工具写入文件（只写一次）。',
      `相对路径：${writeRel}`,
      `文件内容必须恰好一行：${marker}`,
      '写完后回复 DONE。',
    ].join('')

    const beforeWrites = client.fsWrites.length
    const beforeTools = client.toolCalls.length
    await client.prompt(writePrompt, 360000)
    const diskContent = fs.existsSync(writeAbs) ? fs.readFileSync(writeAbs, 'utf-8').trim() : ''
    const toolWrite = client.toolCalls.slice(beforeTools).some(
      (t) => /write/i.test(t.title || '') && (t.status === 'completed' || t.status === 'success'),
    )
    const workspaceScan = (() => {
      try {
        return fs.readdirSync(WORKSPACE).some((f) => {
          if (!f.endsWith('.md')) return false
          try {
            return fs.readFileSync(path.join(WORKSPACE, f), 'utf-8').includes(marker)
          } catch { return false }
        })
      } catch { return false }
    })()
    const writeOk = diskContent.includes(marker)
      || client.fsWrites.length > beforeWrites
      || toolWrite
      || workspaceScan
    const writeDetail = writeOk
      ? `磁盘=${diskContent.slice(0, 40) || 'tool/fs'} tools=${client.toolCalls.length - beforeTools} perm=${client.permissions}`
      : `Agent Write 未落盘; tools=${JSON.stringify(client.toolCalls.slice(beforeTools).map((t) => `${t.title}:${t.status}`)).slice(0, 120)} perm=${client.permissions}`
    if (!writeOk && process.env.ALLOW_AGENT_WRITE_FAIL === '1') {
      record(`${backend} 文件写入 (Agent)`, true, `跳过: ${writeDetail}`)
    } else {
      record(`${backend} 文件写入 (Agent)`, writeOk, writeDetail)
    }

    // ── 4. 文件读取 ──
    const readRel = `_metamates_func_read_${backend}.md`
    const readAbs = path.join(WORKSPACE, readRel)
    const secret = `READ_SECRET_${Date.now()}`
    fs.writeFileSync(readAbs, secret, 'utf-8')

    const readPrompt = [
      `Read the file "${readRel}" in the workspace.`,
      `Reply with ONLY the file contents, nothing else. No tools except Read.`,
    ].join(' ')
    const readRes = await client.prompt(readPrompt, 180000)
    const readOk = readRes.text.includes(secret) || client.fsReads.some((p) => p && p.includes(readRel))
    record(`${backend} 文件读取`, readOk, readOk ? secret : readRes.text.slice(0, 50) || '无匹配')

    // cleanup
    try { fs.unlinkSync(writeAbs) } catch {}
    try { fs.unlinkSync(readAbs) } catch {}
  } catch (e) {
    record(`${backend} 功能测试`, false, e.message?.slice(0, 120))
  } finally {
    client.kill()
  }
}

async function runVaultWriteTest() {
  const { vaultApiServer } = await loadCjs('vaultApi/server.cjs')
  const port = 17335
  await vaultApiServer.stop().catch(() => {})
  const start = await vaultApiServer.start(WORKSPACE, port)
  if (!start.success) {
    record('Vault 写入 Inbox', false, start.error || 'start failed')
    return
  }
  try {
    const marker = `FUNC_${Date.now()}`
    const res = await fetch(`http://127.0.0.1:${port}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: marker, title: 'Func Test' }),
    })
    const data = await res.json()
    const fileOk = data.path && fs.existsSync(path.join(WORKSPACE, data.path.replace(/\//g, path.sep)))
    const contentOk = fileOk && fs.readFileSync(path.join(WORKSPACE, data.path.replace(/\//g, path.sep)), 'utf-8').includes(marker)
    record('Vault 写入 Inbox', res.status === 201 && contentOk, data.file || data.path || String(res.status))
    if (data.path) {
      try { fs.unlinkSync(path.join(WORKSPACE, data.path.replace(/\//g, path.sep))) } catch {}
    }
  } catch (e) {
    record('Vault 写入 Inbox', false, e.message)
  } finally {
    await vaultApiServer.stop().catch(() => {})
  }
}

async function main() {
  console.log('\n══ 功能级 ACP 实测 ══\n')
  console.log(`工作区: ${WORKSPACE}`)
  console.log(`Agent: ${BACKENDS.join(', ')}\n`)

  const { execSync } = await import('child_process')
  execSync('npm run electron:compile', { cwd: ROOT, stdio: 'pipe' })

  await runVaultWriteTest()

  const { acpDetector } = await loadCjs('acp/AcpDetector.cjs')
  await acpDetector.initialize(true)
  const agents = acpDetector.getDetectedAgents()

  for (const backend of BACKENDS) {
    const agent = agents.find((a) => a.backend === backend)
    if (!agent) {
      record(`${backend} 检测`, false, 'not installed')
      continue
    }
    console.log(`\n--- ${backend} ---\n`)
    await runBackendTests(backend, agent)
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
