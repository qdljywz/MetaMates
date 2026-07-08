#!/usr/bin/env node
/**
 * UX 延时审计 — 测量关键操作的响应时间并给出体验评级
 *
 * 用法:
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/ux-latency-audit.mjs
 *
 * 评级阈值 (ms):
 *   excellent ≤300  good ≤800  acceptable ≤2000  slow ≤5000  poor >5000
 */
import { _electron as electron } from '@playwright/test'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'
import { safeElectronCompile } from './lib/safe-electron-compile.mjs'
import {
  closeElectronApp,
  dismissBlockingModals,
  launchElectronApp,
  openCommandPaletteE2e,
  probeAgentConnection,
  sleep,
} from './lib/electron-e2e-lifecycle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'ux-latency-audit-report.json')

const THRESHOLDS = [
  { grade: 'excellent', maxMs: 300 },
  { grade: 'good', maxMs: 800 },
  { grade: 'acceptable', maxMs: 2000 },
  { grade: 'slow', maxMs: 5000 },
]

function gradeLatency(ms) {
  for (const t of THRESHOLDS) {
    if (ms <= t.maxMs) return t.grade
  }
  return 'poor'
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

const metrics = []

function record(category, operation, ms, detail = '') {
  const grade = gradeLatency(ms)
  metrics.push({ category, operation, ms, grade, detail, at: new Date().toISOString() })
  const icon = grade === 'excellent' || grade === 'good' ? '✅' : grade === 'acceptable' ? '⚠️' : '❌'
  console.log(`${icon} [${category}] ${operation}: ${ms}ms (${grade})${detail ? ` — ${detail}` : ''}`)
}

async function waitForSplashDismiss(win, maxMs = 20_000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const visible = await win.locator('[data-testid="startup-splash"]').isVisible().catch(() => false)
    if (!visible) return Date.now() - start
    await sleep(200)
  }
  return Date.now() - start
}

async function waitForAgentReady(win, backend = 'codebuddy', maxMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const probe = await probeAgentConnection(win, backend)
    if (probe.dataStatus === 'connected' && probe.dotGreen) {
      return { ms: Date.now() - start, probe }
    }
    await sleep(500)
  }
  return { ms: Date.now() - start, probe: await probeAgentConnection(win, backend) }
}

async function measureClickToVisible(win, clickSelector, visibleSelector, label) {
  const t0 = Date.now()
  await dismissBlockingModals(win)
  await win.click(clickSelector, { timeout: 8000 })
  await win.locator(visibleSelector).first().waitFor({ state: 'visible', timeout: 15_000 })
  record('交互', label, Date.now() - t0)
  await win.keyboard.press('Escape').catch(() => {})
  await sleep(400)
}

async function main() {
  console.log('═══ MetaMates UX 延时审计 ═══\n')
  const workspace = resolveDefaultWorkspace()
  console.log(`工作区: ${workspace}\n`)

  await ensureDevStack()

  const launchStart = Date.now()
  let app
  let userDataDir
  try {
    ;({ app, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace }))
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    const splashMs = await waitForSplashDismiss(win)
    record('启动', '启动页消失 (含 CLI 等待)', splashMs)

    const startupMetrics = await win.evaluate(() => window.__METAMATES_STARTUP_METRICS__)
    if (startupMetrics) {
      record('启动', 'startupGate 报告耗时', startupMetrics.elapsedMs, startupMetrics.reason)
    }

    record('启动', 'Electron 启动 → 主界面', Date.now() - launchStart)

    await win.locator('[data-testid="agent-toolbar"]').waitFor({ state: 'visible', timeout: 60_000 })
    record('启动', 'Agent 工具栏可见', Date.now() - launchStart)

    const agentWait = await waitForAgentReady(win)
    record(
      'Agent',
      'CLI 连接就绪 (侧栏绿点+footer)',
      agentWait.ms,
      `${agentWait.probe.dataStatus || 'unknown'} chips=${agentWait.probe.chipsEnabled}`,
    )

    await dismissBlockingModals(win)
    const paletteStart = Date.now()
    const paletteOk = await openCommandPaletteE2e(win)
    record('交互', 'Ctrl+P 命令面板', Date.now() - paletteStart, paletteOk ? 'opened' : 'failed')
    if (paletteOk) await win.keyboard.press('Escape')

    await dismissBlockingModals(win)
    const searchStart = Date.now()
    await win.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true }))
    })
    await win.locator('.ant-modal').filter({ hasText: /搜索|Search/i }).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    record('交互', 'Ctrl+Shift+F 全局搜索', Date.now() - searchStart)
    await win.keyboard.press('Escape').catch(() => {})

    await measureClickToVisible(win, '[data-testid="activity-graph"]', '.graph-modal', '点击知识图谱')

    const ipcStart = Date.now()
    const read = await win.evaluate(async (ws) => {
      const rel = '05_模板与配置/Master_Control.md'
      const r = await window.electronAPI.readFile(`${ws}\\${rel.replace(/\//g, '\\')}`)
      return { ok: r.success, len: r.content?.length ?? 0 }
    }, workspace)
    record('文件', 'IPC 读取 Master_Control', Date.now() - ipcStart, read.ok ? `${read.len} chars` : 'fail')

    const treeStart = Date.now()
    const treeNode = win.locator('.ant-tree-treenode:not([aria-hidden="true"]) .ant-tree-node-content-wrapper').first()
    await treeNode.click({ timeout: 10_000 }).catch(() => {})
    await win.locator('.cm-editor').first().waitFor({ state: 'visible', timeout: 12_000 }).catch(() => {})
    record('编辑器', '文件树点击 → 编辑器可见', Date.now() - treeStart)

    const settingsStart = Date.now()
    await win.evaluate(() => window.dispatchEvent(new CustomEvent('metamates:open-settings')))
    await win.locator('.ant-modal').filter({ hasText: /设置|Settings/i }).first().waitFor({ state: 'visible', timeout: 8000 })
    record('交互', '打开设置弹窗', Date.now() - settingsStart)
    await win.keyboard.press('Escape')

    const voiceStart = Date.now()
    await win.locator('[data-testid="voice-button"]').click({ timeout: 5000 }).catch(() => {})
    await sleep(500)
    const voiceActive = await win.locator('[data-testid="voice-button"]').evaluate((el) =>
      el.classList.contains('agent-panel__voice--active'),
    ).catch(() => false)
    record('语音', '麦克风按钮 → listening', Date.now() - voiceStart, voiceActive ? 'active' : 'no-toggle')
    if (voiceActive) await win.locator('[data-testid="voice-button"]').click().catch(() => {})

  } finally {
    await closeElectronApp(app, { userDataDir, cleanupUserData: true })
  }

  const byGrade = Object.fromEntries(
    ['excellent', 'good', 'acceptable', 'slow', 'poor'].map((g) => [g, metrics.filter((m) => m.grade === g).length]),
  )

  const summary = {
    workspace,
    measuredAt: new Date().toISOString(),
    count: metrics.length,
    byGrade,
    metrics,
    recommendations: [],
  }

  if (metrics.some((m) => m.operation.includes('CLI') && m.grade === 'slow' || m.grade === 'poor')) {
    summary.recommendations.push('CLI 冷启动偏慢：启动页 max 15s 合理；可考虑缓存 session 或并行预热多个 Agent')
  }
  if (metrics.some((m) => m.category === '交互' && (m.grade === 'slow' || m.grade === 'poor'))) {
    summary.recommendations.push('部分 UI 交互 >2s：检查 lazy chunk 预加载与 Modal 首次渲染')
  }
  const splash = metrics.find((m) => m.operation.includes('启动页消失'))
  if (splash && splash.ms < 3000) {
    summary.recommendations.push('启动页消失早于 3s minDuration：检查 startupGate minMs 是否生效')
  }

  console.log('\n── 体验分布 ──')
  console.log(`  excellent: ${byGrade.excellent}  good: ${byGrade.good}  acceptable: ${byGrade.acceptable}  slow: ${byGrade.slow}  poor: ${byGrade.poor}`)

  if (summary.recommendations.length) {
    console.log('\n── 建议 ──')
    for (const r of summary.recommendations) console.log(`  • ${r}`)
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2))
  console.log(`\n报告: ${REPORT_PATH}`)

  const poor = metrics.filter((m) => m.grade === 'poor')
  process.exit(poor.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
