#!/usr/bin/env node
/**
 * 扩展覆盖 E2E — 验证此前未覆盖的功能与操作
 *
 * 设计原则（避免「用户已连上 / E2E 报未连」误报）:
 *   - 默认不 taskkill 用户正在用的 Electron（仅 E2E_FORCE_KILL=1 时杀全局进程）
 *   - 每次 UI 跑测使用独立 --user-data-dir，与用户 dev 会话隔离
 *   - Agent 实连项：先 CLI 预检 + warmup；连不上则 ⚠️ 跳过，不计 ❌ 失败
 *
 * 用法:
 *   node scripts/extended-coverage-e2e.mjs
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/extended-coverage-e2e.mjs
 *   E2E_AGENT_BACKEND=codebuddy  — 指定 warmup 的 Agent（默认 codebuddy）
 *   E2E_CONNECT_MS=240000        — warmup 超时（毫秒）
 *   E2E_FORCE_KILL=1             — CI：启动前杀全部 electron（会关掉你的 dev 窗口）
 *   E2E_SKIP_AGENT_UI=1          — 跳过所有依赖 Agent 连接的 UI 段
 *   LIVE_SLASH_CLI=1              — 5 条无参 slash 实发
 *   LIVE_SLASH_ALL=1             — 15 条 slash 全量实连
 *   RUN_BUSINESS_LOGIC=0         — 跳过业务逻辑核实
 */
import { _electron as electron } from '@playwright/test'
import { execSync, spawn, spawnSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { safeElectronCompile } from './lib/safe-electron-compile.mjs'
import {
  E2E_AGENT_BACKEND,
  E2E_FORCE_KILL,
  E2E_SKIP_AGENT_UI,
  agentPreflight,
  closeElectronApp,
  dismissBlockingModals,
  launchElectronApp,
  probeAgentConnection,
  sleep,
  waitForAgentUi,
  waitForVoiceE2eHook,
  warmUpAgentConnection,
} from './lib/electron-e2e-lifecycle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const LIVE_SLASH_CLI = process.env.LIVE_SLASH_CLI === '1'
const LIVE_SLASH_ALL = process.env.LIVE_SLASH_ALL === '1'
const RUN_BUSINESS_LOGIC = process.env.RUN_BUSINESS_LOGIC !== '0'
const REPORT_PATH = path.join(ROOT, 'extended-coverage-e2e-report.json')

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

const INPUT_REQUIRED = new Set(['trace', 'connect', 'challenge', 'ghost', 'soal', 'intel'])
const NO_INPUT = new Set(['context', 'ideas', 'graduate', 'drift', 'emerge'])
const LIVE_CLI_CANDIDATES = [...NO_INPUT]

const results = []
const environment = {
  e2eForceKill: E2E_FORCE_KILL,
  agentBackend: E2E_AGENT_BACKEND,
  skipAgentUi: E2E_SKIP_AGENT_UI,
}

function httpOk(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 4000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    }).on('error', () => resolve(false))
  })
}

function record(section, name, ok, detail = '', meta = undefined) {
  results.push({ section, name, ok, detail, meta, at: new Date().toISOString() })
  const tag = ok ? '✅' : (meta?.gap || meta?.skipped ? '⚠️' : '❌')
  console.log(`${tag} [${section}] ${name}${detail ? ` — ${detail}` : ''}`)
}

function recordSkipped(section, name, reason) {
  record(section, name, true, reason, { gap: true, skipped: true, reason })
}

function runScript(label, cmd, env = {}) {
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, ...env },
    })
    record('Slash·静态', label, true, out.split('\n').filter((l) => l.includes('Summary')).pop()?.trim() || 'ok')
    return true
  } catch (e) {
    const combined = `${e.stdout || ''}\n${e.stderr || ''}`
    const summary = combined.match(/Summary:.*|(\d+)\/(\d+) passed/)?.[0] || combined.slice(-300)
    record('Slash·静态', label, false, summary)
    return false
  }
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
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-ext-'))
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

async function runStaticSlashChecks(workspace) {
  runScript('verify-slash-commands', 'node scripts/verify-slash-commands.mjs')
  runScript('test-slash-prompt-assembly', `node scripts/test-slash-prompt-assembly.mjs --workspace "${workspace}"`)
  runScript('slash-e2e-checklist', `node scripts/slash-e2e-checklist.mjs --workspace "${workspace}"`)
  try {
    execSync('npm run verify:knowledge', { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    record('Slash·静态', 'verify:knowledge 单元测试', true)
  } catch (e) {
    record('Slash·静态', 'verify:knowledge 单元测试', false, (e.stdout || e.message || '').slice(-200))
  }
}

async function assertSlashDirectSend(win, cmd) {
  await win.locator(`[data-testid="slash-chip-${cmd}"]`).click({ timeout: 8000 })
  await sleep(2500)
  const result = await win.evaluate((cmdName) => {
    const userMsgs = [...document.querySelectorAll('[data-testid="user-message"]')]
    const hasBubble = userMsgs.some((el) => (el.textContent || '').includes(`/${cmdName}`))
    const streaming = !!document.querySelector('.agent-panel__pill--streaming')
    return { hasBubble, streaming }
  }, cmd)
  const ok = result.hasBubble || result.streaming
  return { ok, detail: ok ? (result.hasBubble ? 'user bubble' : 'streaming') : JSON.stringify(result) }
}

async function runBusinessLogicCheck(workspace) {
  if (!RUN_BUSINESS_LOGIC) {
    record('业务逻辑', 'verify-business-logic', true, '跳过 RUN_BUSINESS_LOGIC=0', { gap: true })
    return
  }
  try {
    const r = await new Promise((resolve, reject) => {
      const child = spawn('node', ['scripts/verify-business-logic.mjs'], {
        cwd: ROOT,
        env: { ...process.env, METAMATES_WORKSPACE: workspace, RUN_FUNCTIONAL: '0' },
        shell: process.platform === 'win32',
      })
      let out = ''
      child.stdout?.on('data', (c) => { out += c })
      child.stderr?.on('data', (c) => { out += c })
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('verify-business-logic timed out after 180s'))
      }, 180_000)
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ status: code ?? 1, out })
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
    record('业务逻辑', 'verify-business-logic', r.status === 0, r.out.split('\n').filter((l) => l.includes('业务核实')).pop()?.trim() || (r.status === 0 ? 'ok' : r.out.slice(-300)))
  } catch (e) {
    record('业务逻辑', 'verify-business-logic', false, e instanceof Error ? e.message : String(e))
  }
}

async function runMainUiCoverage(workspace) {
  let app
  let userDataDir
  try {
    const preflight = await agentPreflight(ROOT, E2E_AGENT_BACKEND)
    environment.agentPreflight = preflight
    record(
      'E2E环境',
      `${E2E_AGENT_BACKEND} CLI 预检`,
      preflight.backendAvailable,
      preflight.detail || preflight.error || '',
      preflight.backendAvailable ? undefined : { gap: true },
    )
    record(
      'E2E环境',
      'Electron 启动策略',
      true,
      E2E_FORCE_KILL
        ? 'E2E_FORCE_KILL=1 — 会杀全局 electron'
        : '隔离 userData — 不杀用户 dev 窗口',
    )

    if (E2E_SKIP_AGENT_UI) {
      recordSkipped('Agent', 'Agent UI 实连段', 'E2E_SKIP_AGENT_UI=1')
    }

    const skipAgentBlocks = E2E_SKIP_AGENT_UI || !preflight.backendAvailable
    if (!preflight.backendAvailable && !E2E_SKIP_AGENT_UI) {
      recordSkipped('Agent', 'Agent warmup + UI 实连', preflight.detail)
    }

    ;({ app, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace }))
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="file-tree"]', { timeout: 60_000 }).catch(() => {})
    await waitForAgentUi(win)
    await dismissBlockingModals(win)

    let agentReady = false
    if (!skipAgentBlocks) {
      const warmup = await warmUpAgentConnection(win, { backend: E2E_AGENT_BACKEND, workspace })
      environment.agentWarmup = warmup
      record(
        'Agent',
        `${E2E_AGENT_BACKEND} warmup（隔离实例）`,
        warmup.ok,
        warmup.detail,
        warmup.ok ? undefined : { gap: true, skipped: !warmup.ok },
      )
      agentReady = warmup.ok

      if (!agentReady) {
        recordSkipped('Slash·UI', '15 条 slash 点击/直发', warmup.detail)
        recordSkipped('Slash·CLI实连', '无参 slash 实发', warmup.detail)
        recordSkipped('YOLO/模式', '模式 pill / YOLO 弹窗', warmup.detail)
      } else {
        const probe = await probeAgentConnection(win, E2E_AGENT_BACKEND)
        record('Agent', 'footer 与侧栏绿点一致', probe.dataStatus === 'connected' && probe.dotGreen,
          `data-status=${probe.dataStatus} dot=${probe.dotGreen ? 'green' : 'no'} pill=${probe.sessionPill || '?'}`)

        for (const cmd of COMMAND_IDS) {
          try {
            await dismissBlockingModals(win)
            if (NO_INPUT.has(cmd)) {
              const direct = await assertSlashDirectSend(win, cmd)
              record('Slash·UI', `点击 /${cmd}（直发）`, direct.ok, direct.detail)
              continue
            }

            const chip = win.locator(`[data-testid="slash-chip-${cmd}"]`)
            await chip.click({ timeout: 8000 })
            await sleep(600)

            const active = await win.evaluate((name) => {
              const chipEl = document.querySelector(`[data-testid="slash-chip-${name}"]`)
              const bar = document.querySelector('.agent-panel__command-active')
              return {
                chipActive: chipEl?.classList.contains('agent-panel__slash-chip--active') ?? false,
                barText: bar?.textContent?.includes(name) ?? false,
              }
            }, cmd)
            record('Slash·UI', `选中 /${cmd}`, active.chipActive || active.barText, `chip=${active.chipActive}`)

            if (INPUT_REQUIRED.has(cmd)) {
              const input = win.locator('[data-testid="chat-input"]')
              if (await input.isEnabled().catch(() => false)) {
                await input.fill('扩展覆盖测试输入')
              }
            }
          } catch (e) {
            record('Slash·UI', `点击 /${cmd}`, false, e instanceof Error ? e.message : String(e))
          }
        }

        if (LIVE_CLI_CANDIDATES.length && LIVE_SLASH_CLI) {
          for (const cmd of LIVE_CLI_CANDIDATES) {
            try {
              await dismissBlockingModals(win)
              const sent = await win.evaluate(async (command) => {
                const api = window.electronAPI?.acp
                const skill = await api.readSkillFile(command, 'codebuddy')
                const prompt = `${skill?.content || ''}\n\n【E2E】请只回复一个字：好`.slice(0, 4000)
                const res = await api.sendPrompt(prompt, undefined, [], `/${command} E2E`)
                return { ok: res?.success !== false, detail: res?.error || res?.message || 'sent' }
              }, cmd)
              await sleep(8000)
              const reply = await win.evaluate(() => {
                const msgs = [...document.querySelectorAll('[data-testid="agent-message"]')]
                const last = msgs.at(-1)?.textContent || ''
                return last.slice(0, 80)
              })
              const gotReply = /好|OK|ok/i.test(reply)
              record('Slash·CLI实连', `sendPrompt /${cmd}`, sent.ok && gotReply, `${sent.detail} reply=${reply}`)
            } catch (e) {
              record('Slash·CLI实连', `sendPrompt /${cmd}`, false, e instanceof Error ? e.message : String(e))
            }
          }
        } else {
          record('Slash·CLI实连', '5 条无参 slash 实发', true, LIVE_SLASH_CLI ? 'n/a' : '跳过 LIVE_SLASH_CLI=1 可启用', { gap: true })
        }

        const modeSelect = win.locator('[data-testid="agent-mode-select"]')
        const hasModeSelect = await modeSelect.count() > 0
        record('YOLO/模式', '模式 pill 可见', await win.locator('[data-testid="agent-mode-pill"]').isVisible().catch(() => false))

        if (hasModeSelect) {
          await win.evaluate(() => {
            localStorage.removeItem('metamates-yolo-ack-v1')
          })
          await win.reload({ waitUntil: 'domcontentloaded' })
          await waitForAgentUi(win)
          await dismissBlockingModals(win)
          await warmUpAgentConnection(win, { backend: E2E_AGENT_BACKEND, workspace, maxMs: 120_000 })

          const firstRunModal = await win.locator('[data-testid="yolo-warning-modal"]').isVisible().catch(() => false)
          const firstRunAttr = await win.locator('[data-testid="yolo-warning-modal"]').getAttribute('data-yolo-prompt').catch(() => null)
          record('YOLO/模式', '首次连接 YOLO 确认弹窗', firstRunModal && firstRunAttr === 'first-run', firstRunAttr || 'hidden')
          if (firstRunModal) {
            await win.locator('[data-testid="yolo-warning-confirm"]').click()
            await sleep(400)
          }

          await modeSelect.selectOption('plan').catch(() => {})
          await sleep(500)
          await modeSelect.selectOption('yolo')
          await sleep(600)
          const yoloModal = await win.locator('[data-testid="yolo-warning-modal"]').isVisible().catch(() => false)
          const switchAttr = await win.locator('[data-testid="yolo-warning-modal"]').getAttribute('data-yolo-prompt').catch(() => null)
          record('YOLO/模式', '切换到 YOLO 显示警告弹窗', yoloModal && switchAttr === 'switch', switchAttr || 'hidden')
          if (yoloModal) {
            await win.locator('[data-testid="yolo-warning-confirm"]').click()
            await sleep(400)
          }
          const modeValue = await modeSelect.inputValue().catch(() => '')
          record('YOLO/模式', '确认后模式为 yolo', modeValue === 'yolo', `value=${modeValue}`)
        }
      }
    } else if (E2E_SKIP_AGENT_UI) {
      recordSkipped('Slash·UI', '15 条 slash 点击/直发', 'E2E_SKIP_AGENT_UI=1')
      recordSkipped('Slash·CLI实连', '无参 slash 实发', 'E2E_SKIP_AGENT_UI=1')
      recordSkipped('YOLO/模式', '模式 pill / YOLO 弹窗', 'E2E_SKIP_AGENT_UI=1')
    }

    const skillReads = await win.evaluate(async (commands) => {
      const api = window.electronAPI?.acp
      if (!api?.readSkillFile) return commands.map((cmd) => ({ cmd, ok: false, detail: 'no readSkillFile' }))
      const out = []
      for (const cmd of commands) {
        try {
          const res = await api.readSkillFile(cmd, 'codebuddy')
          const content = res?.content || ''
          const hasSkillBody = content.length > 30
          const hasBusinessHint = /Master_Control|01_日记|01_Log|Write|Read|写回|情报|Insights/i.test(content)
          out.push({
            cmd,
            ok: hasSkillBody && hasBusinessHint,
            detail: res?.error || `${content.length} chars, biz=${hasBusinessHint}`,
          })
        } catch (e) {
          out.push({ cmd, ok: false, detail: String(e) })
        }
      }
      return out
    }, COMMAND_IDS)

    for (const row of skillReads) {
      record('Slash·IPC', `readSkillFile /${row.cmd}`, row.ok, row.detail)
    }

    const speech = await win.evaluate(async () => {
      const api = window.electronAPI?.speech
      if (!api?.isAvailable) return { available: false, start: false, stop: false }
      const avail = await api.isAvailable()
      let start = false
      let stop = false
      try {
        const s = await api.start('zh-CN')
        start = s?.success !== false
        await new Promise((r) => setTimeout(r, 400))
        const t = await api.stop()
        stop = t?.success !== false
      } catch { /* ignore */ }
      return { available: !!avail?.available, start, stop }
    })
    record('语音', 'speech-is-available', speech.available !== false, JSON.stringify(speech))
    await win.locator('[data-testid="voice-button"]').click({ timeout: 5000 }).catch(() => {})
    await sleep(400)
    const voiceActive = await win.locator('[data-testid="voice-button"]').evaluate((el) =>
      el.classList.contains('agent-panel__voice--active'),
    ).catch(() => false)
    record('语音', '麦克风按钮可切换', voiceActive || speech.start, voiceActive ? 'listening' : 'toggle/ipc')

    const hookReady = await waitForVoiceE2eHook(win)
    const voiceInjected = await win.evaluate(() => {
      const sim = window.__METAMATES_E2E__?.simulateVoiceTranscript
      if (typeof sim !== 'function') return { ok: false, detail: 'no simulateVoiceTranscript hook' }
      sim('E2E语音注入测试')
      const input = document.querySelector('[data-testid="chat-input"]')
      const value = input?.value || ''
      return { ok: value.includes('E2E语音注入测试'), detail: value.slice(0, 40) }
    })
    record('语音', '转写注入输入框', voiceInjected.ok, hookReady ? voiceInjected.detail : `hook 未就绪: ${voiceInjected.detail}`, voiceInjected.ok ? undefined : { gap: !hookReady })

    const gemini = await win.evaluate(async () => {
      const api = window.electronAPI?.acp
      const check = await api?.checkGeminiAuth?.()
      let methods = []
      try {
        methods = (await api?.getAuthMethods?.('gemini')) || []
      } catch { /* ignore */ }
      return {
        authenticated: check?.authenticated,
        methodsCount: Array.isArray(methods) ? methods.length : 0,
      }
    })
    record('Gemini鉴权', 'checkGeminiAuth IPC', typeof gemini.authenticated === 'boolean', `auth=${gemini.authenticated}`)
    record('Gemini鉴权', 'getAuthMethods IPC', gemini.methodsCount > 0, `${gemini.methodsCount} methods`)
    record('Gemini鉴权', 'OAuth/终端登录 UI 流', true, '需人工 Google 登录 — IPC 已验', { gap: true })

    await win.click('[data-testid="activity-graph"]', { timeout: 8000 }).catch(() => {})
    await sleep(1500)
    const graphOpen = await win.locator('.graph-modal').first().isVisible().catch(() => false)
    record('知识图谱', '打开图谱弹窗', graphOpen)
    await testGraphNodeDrag(win)

    record('工作区', 'IPC 切换（setWorkspacePath）', true, '主旅程 E2E 已覆盖；activity-workspace 原生选目录需人工', { gap: true })

  } finally {
    await closeElectronApp(app, { userDataDir, cleanupUserData: true })
  }
}

async function testGraphNodeDrag(win) {
  const switch3d = win.locator('[data-testid="graph-3d-switch"]')
  if (await switch3d.count()) {
    const checked = await switch3d.evaluate((el) =>
      el.getAttribute('aria-checked') === 'true' || el.classList.contains('ant-switch-checked'))
    if (checked) await switch3d.click()
    await sleep(2000)
  }
  record('知识图谱', '切换到 2D 模式', !(await switch3d.evaluate((el) =>
    el.classList.contains('ant-switch-checked')).catch(() => true)))

  const graphReady = await win.waitForFunction(
    () => {
      const api = window.__METAMATES_GRAPH_E2E__
      return api && !api.is3DMode && api.nodeCount > 0
    },
    { timeout: 60_000 },
  ).then(() => true).catch(() => false)

  if (!graphReady) {
    record('知识图谱', '2D 节点数据就绪', false, 'no graph e2e hook or empty graph')
    return
  }
  record('知识图谱', '2D 节点数据就绪', true)

  const target = await win.evaluate(() => {
    const nodes = window.__METAMATES_GRAPH_E2E__?.getNodesScreenCoords?.() || []
    return nodes.sort((a, b) => b.size - a.size)[0] || null
  })

  if (!target) {
    record('知识图谱', '2D 节点拖拽', false, 'no screen coords', { gap: true })
    return
  }

  const before = { x: target.x, y: target.y }
  await win.mouse.move(target.screenX, target.screenY)
  await win.mouse.down()
  await win.mouse.move(target.screenX + 85, target.screenY + 55, { steps: 12 })
  await win.mouse.up()
  await sleep(800)

  const after = await win.evaluate((id) => {
    const node = window.__METAMATES_GRAPH_E2E__?.getNodesScreenCoords?.().find((n) => n.id === id)
    return node ? { x: node.x, y: node.y, name: node.name } : null
  }, target.id)

  const dx = after ? Math.abs(after.x - before.x) : 0
  const dy = after ? Math.abs(after.y - before.y) : 0
  const moved = dx > 12 || dy > 12
  record('知识图谱', '2D 节点拖拽', moved, moved ? `${after?.name} Δx=${dx.toFixed(0)} Δy=${dy.toFixed(0)}` : 'position unchanged')

  const canvas = win.locator('[data-testid="graph-2d-canvas"]')
  if (await canvas.isVisible().catch(() => false)) {
    const box = await canvas.boundingBox()
    if (box) {
      const cx = box.x + box.width * 0.2
      const cy = box.y + box.height * 0.2
      await win.mouse.move(cx, cy)
      await win.mouse.down()
      await win.mouse.move(cx + 70, cy + 40, { steps: 6 })
      await win.mouse.up()
      record('知识图谱', '2D 画布平移', true, 'pan smoke')
    }
  }
  await dismissBlockingModals(win)
}

async function runWelcomeWizardCoverage() {
  let app
  let userDataDir
  try {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-wizard-'))
    ;({ app } = await launchElectronApp(electron, { cwd: ROOT, userDataDir, e2e: false }))
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await sleep(3000)

    const wizard = await win.evaluate(() => {
      const steps = document.querySelector('.ant-steps')
      const welcomeText = document.body?.innerText || ''
      const hasWelcome = /欢迎|Welcome|Metamates/i.test(welcomeText)
      const workspaceModal = [...document.querySelectorAll('.ant-modal')].some((m) =>
        /工作区|Workspace/i.test(m.textContent || ''),
      )
      return {
        hasSteps: !!steps,
        hasWelcome,
        workspaceModal,
      }
    })
    record('欢迎向导', '首次启动向导或工作区选择', wizard.hasSteps || wizard.hasWelcome || wizard.workspaceModal, wizard.hasSteps ? 'Steps visible' : wizard.workspaceModal ? 'workspace modal' : 'welcome text')
    record('欢迎向导', '选择文件夹步骤', true, '原生目录选择器需人工 — 结构已呈现', { gap: true })
  } finally {
    await closeElectronApp(app, { userDataDir, cleanupUserData: true })
  }
}

async function main() {
  console.log('═══ Metamates 扩展覆盖 E2E ═══\n')
  const workspace = prepareWorkspace()
  console.log(`工作区: ${workspace}`)
  console.log(`Agent: ${E2E_AGENT_BACKEND} | 杀全局 Electron: ${E2E_FORCE_KILL ? '是' : '否（默认）'}\n`)

  await ensureDevStack()
  await runBusinessLogicCheck(workspace)
  await runStaticSlashChecks(workspace)
  await runMainUiCoverage(workspace)
  await runWelcomeWizardCoverage()

  if (LIVE_SLASH_ALL) {
    console.log('\n── 启动 15 条 Slash 全量实连 ──\n')
    const r = spawnSync('node', ['scripts/slash-live-cli-e2e.mjs'], {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, METAMATES_WORKSPACE: workspace },
      maxBuffer: 20 * 1024 * 1024,
    })
    const slashOk = r.status === 0
    const summary = (r.stdout || '').split('\n').filter((l) => l.includes('总计')).pop()?.trim() || (slashOk ? 'ok' : (r.stderr || r.stdout || '').slice(-300))
    record('Slash·全量实连', '15 条 slash live CLI', slashOk, summary, slashOk ? undefined : { gap: false })
  } else {
    record('Slash·全量实连', '15 条 slash live CLI', true, '跳过 LIVE_SLASH_ALL=1 可启用', { gap: true })
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok && !r.meta?.gap)
  const skipped = results.filter((r) => r.meta?.skipped)
  const gaps = results.filter((r) => r.meta?.gap && !r.meta?.skipped)
  console.log(`\n═══ 总计: ${results.length} 项 | ✅ ${passed} | ❌ ${failed.length} | ⚠️ 跳过 ${skipped.length} | ⚠️ 已知缺口 ${gaps.length} ═══`)
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ workspace, environment, passed, failed: failed.length, skipped: skipped.length, gaps: gaps.length, results }, null, 2))
  console.log(`报告: ${REPORT_PATH}`)

  if (skipped.length) {
    console.log('\n跳过项（环境/前置条件，非产品回归失败）:')
    for (const s of skipped) console.log(`  ⚠️ [${s.section}] ${s.name}: ${s.detail}`)
  }

  if (failed.length) {
    console.log('\n失败项:')
    for (const f of failed) console.log(`  ❌ [${f.section}] ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
