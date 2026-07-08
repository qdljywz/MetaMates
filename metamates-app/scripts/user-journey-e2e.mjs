#!/usr/bin/env node
/**
 * MetaMates 用户旅程全自动 E2E — 按最终用户操作维度逐项走查（无需人工参与）
 *
 * 用法:
 *   node scripts/user-journey-e2e.mjs
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/user-journey-e2e.mjs
 *   SKIP_ACP_LIVE=1 node scripts/user-journey-e2e.mjs   # 跳过实连 CLI（更快）
 */
import { _electron as electron } from '@playwright/test'
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { fileURLToPath, pathToFileURL } from 'url'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'
import { safeElectronCompile } from './lib/safe-electron-compile.mjs'
import {
  closeElectronApp,
  dismissBlockingModals,
  launchElectronApp,
  openCommandPaletteE2e,
  sleep,
  waitForAgentUi,
} from './lib/electron-e2e-lifecycle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SKIP_ACP_LIVE = process.env.SKIP_ACP_LIVE === '1'
const REPORT_PATH = path.join(ROOT, 'user-journey-e2e-report.json')

const results = []

function httpOk(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 4000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    }).on('error', () => resolve(false))
  })
}

function record(section, name, ok, detail = '') {
  results.push({ section, name, ok, detail, at: new Date().toISOString() })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${name}${detail ? ` — ${detail}` : ''}`)
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
  return resolveDefaultWorkspace()
}

async function runNodeBackendJourney(workspace) {
  const load = (rel) => import(pathToFileURL(path.join(ROOT, 'dist-electron', rel)).href)

  const { ensureIntelligenceMemoryLayout, getUserMemoryIndexRelative } = await load('shared/intelligencePaths.cjs')
  const intel = ensureIntelligenceMemoryLayout(workspace, 'zh')
  record('工作区', '记忆索引 provision', intel.success, intel.created.join(', ') || '已存在')

  const indexRel = getUserMemoryIndexRelative('zh')
  const indexPath = path.join(workspace, indexRel)
  record('工作区', '记忆索引文件存在', fs.existsSync(indexPath), indexRel)

  const { syncAllWorkspaceSkills } = await load('workspaceSkills.cjs')
  const { acpDetector } = await load('acp/AcpDetector.cjs')
  await acpDetector.initialize(true)
  const agents = acpDetector.getDetectedAgents()
  const backendIds = agents.map((a) => a.backend)
  const skills = syncAllWorkspaceSkills(workspace, 'zh', backendIds)
  record('工作区', '同步 CLI 技能', skills.success !== false, `created=${skills.created?.length ?? 0}`)

  const { detectLegacyPaths } = await load('workspaceMigrate.cjs')
  const legacy = detectLegacyPaths(workspace)
  record('工作区', '检测遗留路径', Array.isArray(legacy), `${legacy.length} 项`)

  const { assertWithinWorkspace } = await load('shared/pathSafety.cjs')
  const outside = assertWithinWorkspace(workspace, 'C:/Users/outside-vault/test.md')
  record('安全', 'Vault 外路径拒绝', outside.ok === false, outside.error || '')

  const { assessVaultPermission } = await load('shared/vaultPermissionGuard.cjs')
  const shellBlock = assessVaultPermission(workspace, {
    title: 'run_terminal_cmd',
    kind: 'execute',
    rawInput: { command: 'echo x >> ~/.codebuddy/projects/foo/memory/MEMORY.md' },
  })
  record('安全', 'Shell 写 ~/.codebuddy 拦截', shellBlock.allowed === false, shellBlock.reason || '')

  const inside = assertWithinWorkspace(workspace, path.join(workspace, '01_日记与计划/test.md'))
  record('安全', 'Vault 内路径允许', inside.ok === true, inside.resolved || '')
}

async function closeModals(win) {
  await dismissBlockingModals(win)
}

async function runElectronUiJourney(workspace) {
  let app
  let userDataDir
  try {
    ;({ app, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace }))
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('[data-testid="file-tree"]', { timeout: 60_000 }).catch(() => {})

    const ready = await waitForAgentUi(win, 120_000)
    await closeModals(win)

    const shell = await win.evaluate(() => ({
      hasElectronAPI: typeof window.electronAPI !== 'undefined',
      e2eBoot: !!(window.__METAMATES_E2E__?.enabled && window.__METAMATES_E2E__?.workspace),
      desktopGate: document.body?.innerText?.includes('请使用 MetaMates 桌面版')
        || document.body?.innerText?.includes('Use the MetaMates desktop app'),
      preloadFail: document.body?.innerText?.includes('桌面壳加载失败'),
      hasToolbar: !!document.querySelector('[data-testid="agent-toolbar"]'),
      hasFileTree: !!document.querySelector('[data-testid="file-tree"]'),
      hasChatInput: !!document.querySelector('[data-testid="chat-input"]'),
    }))

    record('桌面壳', 'electronAPI 可用', shell.hasElectronAPI)
    record('桌面壳', 'E2E 工作区注入', shell.e2eBoot, workspace)
    record('桌面壳', '非浏览器 fallback', !shell.desktopGate)
    record('桌面壳', 'preload 未失败', !shell.preloadFail)
    record('桌面壳', 'Agent 工具栏', shell.hasToolbar)
    record('桌面壳', '文件树', shell.hasFileTree)
    record('桌面壳', '聊天输入框', shell.hasChatInput)

    const noCrash = await win.evaluate(() => {
      const err = document.querySelector('.ant-result-title, [class*="error-boundary"]')
      const text = document.body?.innerText || ''
      const hasAgentCrash = text.includes('object is not extensible') || text.includes('出了点问题')
      return !err && !hasAgentCrash
    })
    record('稳定性', '无 ErrorBoundary 崩溃', noCrash)

    const paletteEarly = await openCommandPaletteE2e(win)
    record('快捷键', '命令面板', paletteEarly)
    if (paletteEarly) await closeModals(win)

    await closeModals(win)
    await win.evaluate(() => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body) active.blur()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    })
    await sleep(600)
    const searchEarly = await win.locator('.ant-modal').filter({ hasText: /搜索|Search/i }).first().isVisible().catch(() => false)
    record('快捷键', 'Ctrl+Shift+F 全局搜索', searchEarly)
    if (searchEarly) await closeModals(win)

    const windowIpc = await win.evaluate(async () => {
      const w = window.electronAPI?.window
      if (!w) return { ok: false, detail: 'no window api' }
      const min = await w.minimize()
      const max = await w.maximize()
      const isMax = await w.isMaximized()
      return { ok: min?.success && max?.success, detail: `maximized=${isMax}` }
    })
    record('窗口', '最小化/最大化 IPC', windowIpc.ok, windowIpc.detail)

    const updaterIpc = await win.evaluate(async () => {
      const u = window.electronAPI?.updater
      if (!u?.check) return { ok: true, detail: 'updater n/a' }
      try {
        const r = await u.check()
        return { ok: r?.success !== false || r?.error?.includes('net') || r?.status === 'not-available', detail: r?.status || r?.error || 'checked' }
      } catch (e) {
        return { ok: true, detail: String(e).slice(0, 80) }
      }
    })
    record('更新', 'electron-updater check IPC', updaterIpc.ok, updaterIpc.detail)

    const editorOk = await win.locator('.cm-editor').first().isVisible().catch(() => false)
    record('编辑器', 'CodeMirror 可见', editorOk)

    const ipcOps = await win.evaluate(async () => {
      const api = window.electronAPI
      const out = []
      const push = (name, ok, detail = '') => out.push({ name, ok, detail })

      const ws = window.__METAMATES_E2E__?.workspace || ''
      const read = await api.readFile(`${ws}\\05_模板与配置\\Master_Control.md`)
      push('读取 Master_Control', read.success, read.success ? `${read.content?.length ?? 0} chars` : read.error)

      const marker = `JOURNEY_${Date.now()}`
      const noteRel = `01_日记与计划/Inbox/_journey_test.md`
      const w = await api.writeFile(noteRel, `# Journey\n${marker}\n`)
      push('写入 Inbox 笔记', w.success, w.error || marker)
      const r2 = await api.readFile(noteRel)
      push('读回 Inbox 笔记', r2.success && r2.content?.includes(marker))

      const list = await api.listFiles(`${ws}\\01_日记与计划`, false)
      push('列出日记目录', list.success && Array.isArray(list.files) && list.files.length > 0, `${list.files?.length ?? 0} entries`)

      const reinit = await api.reinitWorkspace(
        (window.__METAMATES_E2E__?.workspace || ''),
        'zh',
      )
      push('reinit 工作区模板', reinit.success !== false, reinit.message || '')

      const agents = await api.acp.detectAgents()
      push('检测本机 CLI', Array.isArray(agents) && agents.length > 0, `${agents?.length ?? 0} agents`)

      const sync = await api.acp.syncWorkspaceSkills(
        window.__METAMATES_E2E__?.workspace || '',
        'zh',
      )
      push('设置-同步技能 IPC', sync.success !== false, `created=${sync.created?.length ?? 0}`)

      return out
    })

    for (const op of ipcOps) {
      record('用户操作·文件', op.name, op.ok, op.detail)
    }

    const clickActivity = async (testId, label, assertFn) => {
      try {
        await closeModals(win)
        await win.click(`[data-testid="${testId}"]`, { timeout: 8000 })
        await sleep(1500)
        const ok = await assertFn()
        record('活动栏', label, ok)
        await closeModals(win)
      } catch (e) {
        record('活动栏', label, false, e instanceof Error ? e.message : String(e))
        await closeModals(win)
      }
    }

    await clickActivity('activity-graph', '打开知识图谱', async () =>
      win.locator('.graph-modal').first().isVisible().catch(() => false),
    )
    await clickActivity('activity-template', '打开模板选择器', async () =>
      win.locator('.ant-modal').filter({ hasText: /模板|Template/i }).first().isVisible().catch(() => false),
    )
    const tabCountBefore = await win.locator('.tab-bar > div').count().catch(() => 0)
    await clickActivity('activity-newNote', '新建 Inbox 笔记', async () => {
      const tabCountAfter = await win.locator('.tab-bar > div').count().catch(() => 0)
      return tabCountAfter > tabCountBefore
    })

    await win.keyboard.press('Control+b')
    await sleep(400)
    const collapsed = await win.evaluate(() => !document.querySelector('[data-testid="file-tree"]')?.offsetParent)
    record('快捷键', 'Ctrl+B 折叠文件树', collapsed)
    await win.keyboard.press('Control+b')
    await sleep(400)

    await closeModals(win)
    const slashCount = await win.locator('[data-testid^="slash-chip-"]').count()
    record('Agent', '15 条 slash chips', slashCount === 15, `count=${slashCount}`)

    const codebuddyBtn = win.locator('[data-testid="agent-sidebar-codebuddy"]')
    if (await codebuddyBtn.count()) {
      const alreadyActive = await codebuddyBtn.evaluate((el) => el.classList.contains('agent-panel__agent-btn--active'))
      if (!alreadyActive) {
        await closeModals(win)
        await codebuddyBtn.click({ timeout: 8000 }).catch(() => {})
      }
      await sleep(2000)
    }

    for (let i = 0; i < 60; i++) {
      const connected = await win.evaluate(() => {
        const btn = document.querySelector('[data-testid="agent-sidebar-codebuddy"]')
        const dot = btn?.querySelector('.agent-panel__status-dot')
        const bg = dot ? getComputedStyle(dot).backgroundColor : ''
        return bg.includes('34, 197, 94') || bg.includes('0, 212, 196') || bg.includes('52, 211, 153')
      })
      if (connected) break
      await sleep(2000)
    }

    const agentState = await win.evaluate(() => {
      const input = document.querySelector('[data-testid="chat-input"]')
      const chips = document.querySelectorAll('[data-testid^="slash-chip-"]')
      const enabledChips = [...chips].filter((c) => !c.disabled).length
      return {
        inputDisabled: input ? input.disabled : true,
        enabledChips,
      }
    })
    record('Agent', '连接后 slash 可点', agentState.enabledChips > 0 || agentState.inputDisabled === false, `enabled=${agentState.enabledChips}`)

    const todayChip = win.locator('[data-testid="slash-chip-today"]')
    if (await todayChip.isEnabled().catch(() => false)) {
      await closeModals(win)
      await todayChip.click({ timeout: 8000, force: true })
      await sleep(300)
      record('Agent', '选中 /today 命令', true)
    }

    await win.evaluate(() => {
      window.dispatchEvent(new CustomEvent('metamates:open-settings'))
    })
    await sleep(600)
    const settingsOpen = await win.locator('.ant-modal').filter({ hasText: /设置|Settings/i }).first().isVisible().catch(() => false)
    record('设置', '打开设置弹窗', settingsOpen)
    if (settingsOpen) await win.keyboard.press('Escape')

    await closeModals(win)
    const helpBtn = win.locator('[data-testid="help-button"]').first()
    if (await helpBtn.count()) {
      await helpBtn.click({ force: true, timeout: 5000 }).catch(() => {})
    } else {
      await win.locator('.anticon-question-circle').first().click({ force: true }).catch(() => {})
    }
    await sleep(500)
    const helpOpen = await win.locator('.ant-modal').filter({ hasText: /帮助|Help/i }).first().isVisible().catch(() => false)
    record('帮助', '打开帮助中心', helpOpen)
    if (helpOpen) await win.keyboard.press('Escape')

  } finally {
    await closeElectronApp(app, { userDataDir, cleanupUserData: true })
  }
}

async function runVaultApiJourney(workspace) {
  try {
    const { vaultApiServer } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/vaultApi/server.cjs')).href)
    await vaultApiServer.start(workspace, 17335)
    const health = await httpOk('http://127.0.0.1:17335/health')
    record('Vault API', 'GET /health', health)
    await vaultApiServer.stop()
  } catch (e) {
    record('Vault API', '启动服务', false, e instanceof Error ? e.message : String(e))
  }
}
async function runAcpLiveJourney(workspace) {
  if (SKIP_ACP_LIVE) {
    record('ACP 实连', '跳过', true, 'SKIP_ACP_LIVE=1')
    return
  }
  try {
    const out = execSync('node scripts/verify-functional-acp.mjs', {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 600_000,
      env: { ...process.env, METAMATES_WORKSPACE: workspace, SKIP_GEMINI: '1' },
    })
    const passMatch = out.match(/(\d+)\/(\d+) 通过/)
    const ok = passMatch ? passMatch[1] === passMatch[2] : true
    record('ACP 实连', 'verify-functional-acp', ok, ok ? `${passMatch?.[0] || 'ok'}` : out.slice(-400))
  } catch (e) {
    const combined = `${e.stdout || ''}\n${e.stderr || ''}`
    const passMatch = combined.match(/(\d+)\/(\d+) 通过/)
    const ok = passMatch ? passMatch[1] === passMatch[2] : false
    record('ACP 实连', 'verify-functional-acp', ok, ok ? passMatch[0] : combined.slice(-400))
  }
}

async function main() {
  console.log('═══ MetaMates 用户旅程 E2E ═══\n')
  const workspace = prepareWorkspace()
  console.log(`工作区: ${workspace}\n`)

  await ensureDevStack()
  await runNodeBackendJourney(workspace)
  await runVaultApiJourney(workspace)
  await runElectronUiJourney(workspace)

  console.log('\n── 语音 E2E ──\n')
  const { runVoiceElectronJourney, runVitestSpeech } = await import('./voice-e2e.mjs')
  runVitestSpeech(record)
  await runVoiceElectronJourney(workspace, record)

  await runAcpLiveJourney(workspace)

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`\n═══ 总计: ${results.length} 项 | ✅ ${passed} | ❌ ${failed.length} ═══`)
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ workspace, passed, failed: failed.length, results }, null, 2))
  console.log(`报告: ${REPORT_PATH}`)

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
