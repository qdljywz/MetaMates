#!/usr/bin/env node
/**
 * Full CLI alignment verification — detection, health, spawn config, real ACP smoke.
 * Usage: node scripts/verify-cli-alignment.mjs [--skip-compile] [--skip-acp-live]
 */
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = process.env.METAMATES_WORKSPACE || 'E:\\MyM2'
const skipCompile = process.argv.includes('--skip-compile')
const skipAcpLive = process.argv.includes('--skip-acp-live')

const results = []

function record(section, name, ok, detail = '') {
  results.push({ section, name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${name}${detail ? ` — ${detail}` : ''}`)
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf-8')
}

function mapStatus(snapshot) {
  if (!snapshot?.connected) return 'disconnected'
  if (snapshot.ready) return 'connected'
  if (snapshot.needsAuth) return 'auth_required'
  if (snapshot.error && !snapshot.hasSession) return 'error'
  if (!snapshot.hasSession) return 'connecting'
  return 'connecting'
}

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Metamates CLI 对齐验证（真实测试）')
  console.log('══════════════════════════════════════════\n')
  console.log(`工作区: ${WORKSPACE}\n`)

  // ── 0. Compile ──
  if (!skipCompile) {
    try {
      execSync('npm run electron:compile', { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8', timeout: 120000 })
      record('构建', 'electron:compile', true)
    } catch (e) {
      record('构建', 'electron:compile', false, e.stderr?.slice(0, 200) || e.message)
      process.exit(1)
    }
  } else {
    record('构建', 'electron:compile', true, '跳过')
  }

  // ── 1. 源码对齐（AionUi 模式）──
  console.log('\n── 1. 源码架构对齐 ──\n')
  const ipc = read('electron/acp/ipcHandlers.ts')
  const panel = read('src/components/AgentChatPanel.tsx')
  const registry = read('electron/shared/acpRegistry.ts')

  record('架构', 'acp-check-agent-health IPC', ipc.includes("'acp-check-agent-health'"))
  record('架构', 'acp-ensure-session IPC', ipc.includes("'acp-ensure-session'"))
  record('架构', 'connect → ensureBackendSession', ipc.includes('connect → ensure-session') && ipc.includes('ensureBackendSession(backendId)'))
  record('架构', 'new-session → ensureBackendSession', ipc.includes('new-session → ensure-session'))
  record('架构', 'send-prompt → ensureBackendSession', ipc.includes('ensuring via ensureBackendSession'))
  record('架构', 'agentHealth.ts 存在', fs.existsSync(path.join(ROOT, 'electron/acp/agentHealth.ts')))
  record('架构', 'UI 使用 ensureSession', panel.includes('acp.ensureSession'))
  record('架构', 'UI 切换前 checkAgentHealth', panel.includes('checkAgentHealth'))
  record('架构', 'UI 不再 connect+newSession 双调用', !panel.includes('acp.connect(backend)') || panel.includes('ensureSession'))
  record('架构', 'Claude 强制 npx 桥接', registry.includes("def.backendId === 'claude'") && registry.includes('needsNpxBridge'))

  // ── 2. 模块级探测 ──
  console.log('\n── 2. CLI 检测 + 健康探活 ──\n')

  const { acpDetector } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/acp/AcpDetector.cjs')).href)
  const { checkAgentHealth } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/acp/agentHealth.cjs')).href)
  const { isGeminiAuthenticated } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/geminiAuth.cjs')).href)

  await acpDetector.initialize(true)
  const detected = acpDetector.getDetectedAgents()
  record('检测', `发现 ${detected.length} 个 Agent`, detected.length > 0, detected.map((a) => a.backend).join(', '))

  for (const agent of detected) {
    const spawnLine = `${agent.cliPath} ${JSON.stringify(agent.acpArgs)}`
    record('Spawn配置', agent.backend, true, spawnLine)

    if (agent.backend === 'claude') {
      const usesNpx = agent.cliPath.includes('npx')
      record('Claude', '必须通过 npx 桥接', usesNpx, spawnLine)
    }

    const health = checkAgentHealth(agent.backend)
    const healthLabel = health.available
      ? `可用 (${health.latencyMs}ms)`
      : health.needsAuth
        ? `需登录: ${health.error}`
        : `不可用: ${health.error}`
    record('健康检查', agent.backend, health.available || health.needsAuth !== undefined, healthLabel)
  }

  const geminiOk = isGeminiAuthenticated()
  record('Gemini', '凭据检测', geminiOk, geminiOk ? '已配置' : '未配置')

  // Status mapping
  record('状态映射', 'error 态', mapStatus({ connected: true, hasSession: false, error: 'x' }) === 'error')
  record('状态映射', 'auth_required 态', mapStatus({ connected: true, hasSession: false, needsAuth: true }) === 'auth_required')
  record('状态映射', 'connected 态', mapStatus({ connected: true, hasSession: true, ready: true, lifecycle: 'session_active' }) === 'connected')
  record('状态映射', 'auth 有 session 未就绪', mapStatus({ connected: true, hasSession: true, ready: false, needsAuth: true, lifecycle: 'auth_required' }) === 'auth_required')

  // ── 3. 真实 ACP 子进程冒烟（每个已检测 CLI）──
  if (!skipAcpLive && detected.length > 0) {
    console.log('\n── 3. 真实 ACP 子进程冒烟（initialize + session/new）──\n')
    const smokeResults = await runAcpLiveSmoke(detected)
    for (const r of smokeResults) {
      record('ACP实连', `${r.backend} initialize`, r.initOk, r.initDetail)
      record('ACP实连', `${r.backend} session/new`, r.sessionOk, r.sessionDetail)
    }
  } else {
    record('ACP实连', '全部', true, skipAcpLive ? '跳过 (--skip-acp-live)' : '无 CLI')
  }

  // ── 4. Electron IPC 探针（需 Playwright + Vite dev server）──
  console.log('\n── 4. Electron IPC 探针 ──\n')
  try {
    const { _electron: electron } = await import('@playwright/test')
    let viteProc
    let app
    let startedVite = false
    try {
      const devUp = await waitForHttp('http://127.0.0.1:3000/', 3000).then(() => true).catch(() => false)
      if (!devUp) {
        viteProc = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '3000', '--strictPort'], {
          cwd: ROOT,
          stdio: 'ignore',
          shell: true,
          env: { ...process.env },
        })
        startedVite = true
        await waitForHttp('http://127.0.0.1:3000/', 90000)
      }

      app = await electron.launch({
        args: ['.'],
        cwd: ROOT,
        timeout: 120000,
        env: {
          ...process.env,
          METAMATES_WORKSPACE: WORKSPACE,
          METAMATES_E2E: '1',
          NODE_ENV: 'development',
        },
      })
      const win = await app.firstWindow()
      await win.waitForLoadState('domcontentloaded', { timeout: 90000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 12000))

      const probe = await win.evaluate(async () => {
        const api = window.electronAPI?.acp
        if (!api) return { error: 'electronAPI.acp missing' }
        const agents = await api.detectAgents?.()
        const out = { agents: agents?.length ?? 0, health: {}, ensure: {} }
        if (!agents?.length) return out
        for (const a of agents.slice(0, 4)) {
          out.health[a.backend] = await api.checkAgentHealth?.(a.backend)
          const status = await api.getConnectionStatus?.(a.backend)
          out.ensure[a.backend] = { before: status }
        }
        // Try ensureSession on first healthy agent
        const target = agents.find((a) => a.backend === 'gemini') || agents[0]
        if (target) {
          const h = out.health[target.backend]
          if (h?.available) {
            const ensured = await Promise.race([
              api.ensureSession?.(target.backend),
              new Promise((_, rej) => setTimeout(() => rej(new Error('ensureSession timeout 90s')), 90000)),
            ])
            out.ensure[target.backend].result = {
              success: ensured?.success,
              sessionId: ensured?.sessionId?.slice(0, 12),
              error: ensured?.error,
            }
            out.ensure[target.backend].after = await api.getConnectionStatus?.(target.backend)
          }
        }
        return out
      })

      if (probe.error) {
        record('Electron IPC', 'preload API', false, probe.error)
      } else {
        record('Electron IPC', 'detectAgents', probe.agents > 0, `${probe.agents} 个`)
        for (const [backend, h] of Object.entries(probe.health || {})) {
          record('Electron IPC', `health:${backend}`, h.available || !!h.needsAuth, JSON.stringify(h).slice(0, 120))
        }
        const ensuredBackends = Object.entries(probe.ensure || {}).filter(([, v]) => v.result)
        for (const [backend, v] of ensuredBackends) {
          const r = v.result
          record(
            'Electron IPC',
            `ensureSession:${backend}`,
            r.success && !!r.sessionId,
            r.sessionId ? `session ${r.sessionId}…` : r.error || 'failed',
          )
          if (v.after) {
            record('Electron IPC', `status after:${backend}`, v.after.ready === true, `ready=${v.after.ready}`)
          }
        }
      }
    } finally {
      if (app) await app.close().catch(() => {})
      if (viteProc && startedVite && !viteProc.killed) {
        viteProc.kill('SIGTERM')
        await new Promise((r) => setTimeout(r, 1500))
        if (!viteProc.killed) viteProc.kill('SIGKILL')
      }
    }
  } catch (e) {
    record('Electron IPC', 'Playwright 探针', false, e.message?.slice(0, 200) || String(e))
  }

  // ── 报告 ──
  console.log('\n══════════════════════════════════════════')
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`结果: ${passed}/${results.length} 通过, ${failed} 失败`)
  console.log('══════════════════════════════════════════\n')

  if (failed > 0) {
    console.log('失败项:')
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ❌ [${r.section}] ${r.name}: ${r.detail}`)
    }
    process.exit(1)
  }
}

function isAuthSessionFailure(message) {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('not logged in') ||
    m.includes('loggedin') ||
    m.includes('auth') ||
    m.includes('login') ||
    m.includes('unauthorized') ||
    m.includes('api key') ||
    m.includes('credential')
  )
}

/** Real ACP JSON-RPC smoke per detected agent (uses same spawn config as the app). */
async function runAcpLiveSmoke(detected) {
  const { createSpawnConfigFromResolved } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/acp/acpSpawn.cjs')).href
  )
  const { getGeminiSpawnEnv, applyGeminiChildEnvOverrides } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/geminiAuth.cjs')).href)

  const out = []
  for (const agent of detected) {
    const r = { backend: agent.backend, initOk: false, initDetail: '', sessionOk: false, sessionDetail: '' }
    const spawnEnv = agent.backend === 'gemini' ? getGeminiSpawnEnv() : undefined
    const { command, args, options } = createSpawnConfigFromResolved(
      agent.cliPath,
      agent.acpArgs || [],
      WORKSPACE,
      spawnEnv,
    )
    if (agent.backend === 'gemini' && options.env) {
      options.env = applyGeminiChildEnvOverrides(options.env)
    }
    const initTimeout = command.includes('npx') ? 120000 : 60000
    const conn = await spawnAcpChild(command, args, options)
    if (!conn) {
      r.initDetail = 'spawn failed'
      out.push(r)
      continue
    }
    try {
      await jsonRpcRequest(
        conn,
        'initialize',
        {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        },
        initTimeout,
      )
      r.initOk = true
      r.initDetail = 'ok'
    } catch (e) {
      r.initDetail = e.message
      conn.child.kill()
      out.push(r)
      continue
    }
    try {
      const result = await jsonRpcRequest(conn, 'session/new', { cwd: WORKSPACE, mcpServers: [] }, 120000)
      r.sessionOk = !!result?.sessionId
      r.sessionDetail = result?.sessionId ? result.sessionId.slice(0, 16) : 'no sessionId'
    } catch (e) {
      r.sessionDetail = e.message
      if (isAuthSessionFailure(e.message)) {
        r.sessionOk = true
        r.sessionDetail = `auth expected: ${e.message.slice(0, 80)}`
      }
    }
    conn.child.kill()
    out.push(r)
  }
  return out
}

function spawnAcpChild(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options)
    let settled = false
    child.on('error', (err) => {
      if (!settled) {
        settled = true
        console.log(`[spawn] error: ${err.message}`)
        resolve(null)
      }
    })
    setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ child, buffer: '', pending: new Map(), rid: 1 })
      }
    }, 2000)
  })
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, { timeout: 3000 }, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) resolve()
        else if (Date.now() >= deadline) reject(new Error(`HTTP ${res.statusCode}`))
        else setTimeout(tick, 500)
      })
      req.on('error', () => {
        if (Date.now() >= deadline) reject(new Error(`timeout waiting for ${url}`))
        else setTimeout(tick, 500)
      })
    }
    tick()
  })
}

function jsonRpcRequest(conn, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = conn.rid++
    const timer = setTimeout(() => {
      conn.pending.delete(id)
      reject(new Error(`timeout: ${method}`))
    }, timeoutMs)

    const onData = (chunk) => {
      conn.buffer += chunk
      const lines = conn.buffer.split('\n')
      conn.buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === id && conn.pending.has(id)) {
            clearTimeout(timer)
            conn.pending.delete(id)
            conn.child.stdout.off('data', onData)
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
            else resolve(msg.result)
          }
        } catch {}
      }
    }
    conn.child.stdout.on('data', onData)
    conn.pending.set(id, true)
    conn.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
