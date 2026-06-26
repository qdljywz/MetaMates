#!/usr/bin/env node
/**
 * 15 条 slash 全量实连 E2E — 经 UI 走完整业务链（chip → 组装 prompt → CodeBuddy → 回复）
 *
 * 用法:
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/slash-live-cli-e2e.mjs
 *   LIVE_SLASH_TIMEOUT_MS=300000  — 单条超时（默认 240s；context/sync 用 360s）
 */
import { _electron as electron } from '@playwright/test'
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { safeElectronCompile } from './lib/safe-electron-compile.mjs'
import {
  closeElectronApp,
  dismissBlockingModals,
  launchElectronApp,
  sleep,
  warmUpAgentConnection,
  E2E_AGENT_BACKEND,
} from './lib/electron-e2e-lifecycle.mjs'

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

const NO_INPUT = new Set(['context', 'ideas', 'graduate', 'drift', 'emerge'])
const INPUT_OPTIONAL = new Set(['today', 'closeday', 'schedule', 'sync'])
const INPUT_REQUIRED = new Set(['trace', 'connect', 'challenge', 'ghost', 'soal', 'intel'])
const LONG_RUNNING = new Set(['context', 'sync', 'graduate', 'closeday', 'today'])

const TEST_INPUT = {
  today: 'E2E：今天优先验证 slash 实连',
  closeday: 'E2E：完成 slash live 测试',
  schedule: 'E2E：本周排期以产品质量为主',
  sync: 'E2E：同步测试备注写入 Master_Control',
  trace: 'Metamates 产品定位',
  connect: '日记 项目',
  challenge: 'Agent 会自动写回 Vault 文件',
  ghost: '如何规划高效的一天',
  soal: 'E2E 习惯：改代码前先跑 verify',
  intel: '05_模板与配置/Master_Control.md',
}

const results = []

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'slash-live-cli-e2e-report.json')
const DEFAULT_TIMEOUT = Number(process.env.LIVE_SLASH_TIMEOUT_MS) || 300_000
const LONG_TIMEOUT = Number(process.env.LIVE_SLASH_LONG_TIMEOUT_MS) || 480_000

function record(cmd, ok, detail = '') {
  results.push({ cmd, ok, detail, at: new Date().toISOString() })
  console.log(`${ok ? '✅' : '❌'} /${cmd}${detail ? ` — ${detail}` : ''}`)
}

function httpOk(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 4000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    }).on('error', () => resolve(false))
  })
}

async function ensureDevStack() {
  await safeElectronCompile({ quiet: true })
  if (!(await httpOk('http://127.0.0.1:3000'))) {
    const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
      cwd: ROOT,
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    })
    vite.unref()
    for (let i = 0; i < 90; i++) {
      if (await httpOk('http://127.0.0.1:3000')) return
      await sleep(1000)
    }
    throw new Error('Vite dev server did not start on :3000')
  }
}

function prepareWorkspace() {
  if (process.env.METAMATES_WORKSPACE?.trim()) {
    return path.resolve(process.env.METAMATES_WORKSPACE)
  }
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-slash-live-'))
  const inits = path.join(ROOT, 'inits', 'zh')
  for (const entry of fs.readdirSync(inits, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const src = path.join(inits, entry.name)
    const dest = path.join(ws, entry.name)
    if (entry.isDirectory()) fs.cpSync(src, dest, { recursive: true })
    else fs.copyFileSync(src, dest)
  }
  return ws
}

async function closeModals(win) {
  if (!isWindowOpen(win)) return
  await dismissBlockingModals(win)
}

async function launchApp(workspace) {
  const { app, win, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace })
  return { app, win, userDataDir }
}

async function closeApp(app, userDataDir) {
  await closeElectronApp(app, { userDataDir, cleanupUserData: true })
}

function isWindowOpen(win) {
  try {
    return typeof win.isClosed === 'function' ? !win.isClosed() : true
  } catch {
    return false
  }
}

async function bootstrapAgent(win, workspace) {
  await win.waitForSelector('[data-testid="file-tree"]', { timeout: 60_000 }).catch(() => {})
  await waitForAgentUi(win)
  await closeModals(win)
  const warmup = await warmUpAgentConnection(win, { backend: E2E_AGENT_BACKEND, workspace, maxMs: 150_000 })
  return warmup.ok
}

async function ensureLiveSession(ctx, workspace) {
  if (ctx.app && isWindowOpen(ctx.win)) {
    const warmup = await warmUpAgentConnection(ctx.win, { backend: E2E_AGENT_BACKEND, workspace, maxMs: 8000 })
    if (warmup.ok) return true
  }
  await closeApp(ctx.app, ctx.userDataDir)
  const launched = await launchApp(workspace)
  ctx.app = launched.app
  ctx.win = launched.win
  ctx.userDataDir = launched.userDataDir
  return bootstrapAgent(ctx.win, workspace)
}

async function waitForSessionActive(win, maxMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const status = await win.locator('[data-testid="acp-connection-status"]').getAttribute('data-status').catch(() => null)
    if (status === 'connected') return true
    await sleep(2000)
  }
  return false
}

async function waitForAgentUi(win, maxMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const ready = await win.evaluate(() => ({
      toolbar: !!document.querySelector('[data-testid="agent-toolbar"]'),
      chat: !!document.querySelector('[data-testid="chat-input"]'),
      chips: document.querySelectorAll('[data-testid^="slash-chip-"]').length,
    }))
    if (ready.toolbar && ready.chat && ready.chips >= 15) return true
    await sleep(2000)
  }
  return false
}

async function waitForIdle(win, maxMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const streaming = await win.locator('.agent-panel__pill--streaming').isVisible().catch(() => false)
    if (!streaming) return true
    await sleep(1500)
  }
  return false
}

async function waitForTurnComplete(win, agentCountBefore, timeoutMs, cmd) {
  const started = Date.now()
  let sawStreaming = false
  let idleAfterStream = 0
  while (Date.now() - started < timeoutMs) {
    if (!isWindowOpen(win)) {
      return { ok: false, detail: 'electron window closed during turn', crashed: true }
    }
    let state
    try {
      state = await win.evaluate((prev) => {
        const streaming = !!document.querySelector('.agent-panel__pill--streaming')
        const agentMsgs = [...document.querySelectorAll('[data-testid="agent-message"]')]
        const userMsgs = [...document.querySelectorAll('[data-testid="user-message"]')]
        const listText = document.querySelector('[data-testid="message-list"]')?.textContent || ''
        const newAgent = agentMsgs.length > prev ? (agentMsgs.at(-1)?.textContent || '').trim().slice(0, 300) : ''
        const lastUser = userMsgs.at(-1)?.textContent?.trim() || ''
        const panelText = document.querySelector('.agent-panel')?.textContent || ''
        const intelOk = /情报|intelligence|Intel/i.test(panelText) && /创建|created|已/i.test(panelText)
        const toolDone = /Tool已完成|落盘验证|写回已验证|writeback verified|已完成|✅/i.test(listText.slice(-1200))
        const writebackOk = /写回已验证|writeback verified/i.test(listText.slice(-1200))
        return { streaming, newAgent, lastUser, agentCount: agentMsgs.length, intelOk, toolDone, writebackOk }
      }, agentCountBefore)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/closed|crashed|destroyed/i.test(msg)) {
        return { ok: false, detail: msg, crashed: true }
      }
      throw e
    }

    if (state.streaming) {
      sawStreaming = true
      idleAfterStream = 0
    } else if (sawStreaming) {
      idleAfterStream += 1
    }

    if (state.intelOk && state.lastUser.includes('/intel')) {
      return { ok: true, detail: 'intel note created', text: state.newAgent }
    }
    if (state.writebackOk && state.lastUser.includes(`/${cmd}`)) {
      return { ok: true, detail: 'writeback verified (Act & Verify)', text: state.newAgent }
    }
    if (state.toolDone && state.lastUser.includes(`/${cmd}`)) {
      return { ok: true, detail: 'tool completed in message list', text: state.newAgent }
    }
    if (sawStreaming && !state.streaming && idleAfterStream >= 4 && state.lastUser.includes(`/${cmd}`)) {
      return { ok: true, detail: state.newAgent || 'stream ended', text: state.newAgent }
    }
    if (sawStreaming && !state.streaming && state.agentCount > agentCountBefore && state.newAgent.length > 2) {
      return { ok: true, detail: state.newAgent.slice(0, 120), text: state.newAgent }
    }
    if (!state.streaming && state.agentCount > agentCountBefore && state.newAgent.length > 2 && Date.now() - started > 8000) {
      return { ok: true, detail: state.newAgent.slice(0, 120), text: state.newAgent }
    }
    await sleep(2000)
  }
  return { ok: false, detail: 'timeout waiting for agent reply' }
}

async function runSlashCommand(ctx, cmd) {
  const win = ctx.win
  const timeoutMs = LONG_RUNNING.has(cmd) ? LONG_TIMEOUT : DEFAULT_TIMEOUT
  if (!isWindowOpen(win)) {
    return { ok: false, detail: 'window not open', crashed: true }
  }
  await closeModals(win)
  await waitForIdle(win, 120_000)

  const agentCountBefore = await win.locator('[data-testid="agent-message"]').count()

  await win.locator(`[data-testid="slash-chip-${cmd}"]`).click({ timeout: 10_000 })
  await sleep(600)

  if (!NO_INPUT.has(cmd)) {
    const text = TEST_INPUT[cmd] || 'E2E 测试输入'
    const input = win.locator('[data-testid="chat-input"]')
    await input.fill(text)
    await sleep(200)
    await win.locator('[data-testid="send-button"]').click({ timeout: 5000 })
  }

  const userOk = await win.waitForFunction(
    (name) => {
      const users = [...document.querySelectorAll('[data-testid="user-message"]')]
      return users.some((el) => (el.textContent || '').includes(`/${name}`))
    },
    cmd,
    { timeout: 20_000 },
  ).then(() => true).catch(() => false)

  if (!userOk) {
    return { ok: false, detail: 'no user bubble with slash command' }
  }

  const turn = await waitForTurnComplete(win, agentCountBefore, timeoutMs, cmd)
  return { ok: turn.ok, detail: turn.detail, crashed: turn.crashed }
}

async function main() {
  console.log('═══ 15 条 Slash 全量实连 E2E ═══\n')
  const workspace = prepareWorkspace()
  console.log(`工作区: ${workspace}\n`)

  await ensureDevStack()
  const ctx = { app: null, win: null, userDataDir: null }
  try {
    const ready = await ensureLiveSession(ctx, workspace)
    if (!ready) {
      console.error('隔离 E2E 实例未连上 CodeBuddy（不影响你手动打开的 dev 窗口）。可加大 E2E_CONNECT_MS 或检查 CLI。')
      process.exit(1)
    }

    for (const cmd of COMMAND_IDS) {
      try {
        const alive = await ensureLiveSession(ctx, workspace)
        if (!alive) {
          record(cmd, false, '无法恢复 Electron / CodeBuddy 会话')
          continue
        }
        const result = await runSlashCommand(ctx, cmd)
        record(cmd, result.ok, result.detail)
        if (result.crashed) {
          console.log(`  ⚠️ /${cmd} 后会话中断，下一条将自动重启 Electron`)
          await sleep(3000)
        } else {
          await sleep(2000)
        }
      } catch (e) {
        record(cmd, false, e instanceof Error ? e.message : String(e))
        await ensureLiveSession(ctx, workspace).catch(() => {})
      }
    }
  } finally {
    await closeApp(ctx.app, ctx.userDataDir)
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`\n═══ 总计: ${results.length} | ✅ ${passed} | ❌ ${failed.length} ═══`)
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ workspace, passed, failed: failed.length, results }, null, 2))
  console.log(`报告: ${REPORT_PATH}`)

  if (failed.length) {
    for (const f of failed) console.log(`  ❌ /${f.cmd}: ${f.detail}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
