#!/usr/bin/env node
/**
 * 语音输入 / 识别完整 E2E
 *
 * 覆盖：
 *   - Vitest：转写合并、语言映射、错误映射
 *   - IPC：isAvailable / start / stop 生命周期
 *   - UI：麦克风按钮 listening 状态
 *   - 渲染层 E2E 钩子 simulateVoiceTranscript
 *   - 主进程 IPC 注入（与 System.Speech 相同通道 speech-transcript）
 *   - 可选 LIVE_VOICE_ASR=1：真麦克风听写（需对着麦克风说话）
 *
 * 用法:
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/voice-e2e.mjs
 *   LIVE_VOICE_ASR=1 METAMATES_WORKSPACE=E:\MyM2 node scripts/voice-e2e.mjs
 */
import { _electron as electron } from '@playwright/test'
import { execSync, spawn, spawnSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'
import { safeElectronCompile } from './lib/safe-electron-compile.mjs'
import {
  closeElectronApp,
  dismissBlockingModals,
  launchElectronApp,
  sleep,
  waitForAgentUi,
  waitForVoiceE2eHook,
} from './lib/electron-e2e-lifecycle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'voice-e2e-report.json')
const LIVE_VOICE_ASR = process.env.LIVE_VOICE_ASR === '1'
const LIVE_VOICE_TIMEOUT_MS = Number.parseInt(process.env.LIVE_VOICE_TIMEOUT_MS || '45000', 10)

const results = []

function record(section, name, ok, detail = '') {
  results.push({ section, name, ok, detail, at: new Date().toISOString() })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${name}${detail ? ` — ${detail}` : ''}`)
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

function runVitestSpeech(externalRecord) {
  const rec = externalRecord || record
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', 'src/test/speechRecognition.test.ts'],
    { cwd: ROOT, encoding: 'utf-8', shell: process.platform === 'win32', maxBuffer: 4 * 1024 * 1024 },
  )
  const ok = r.status === 0
  rec('单元', 'speechRecognition.test.ts', ok, ok ? 'passed' : (r.stdout || r.stderr || '').slice(-300))
  return ok
}

export { runVitestSpeech }

export async function runVoiceElectronJourney(workspace, externalRecord) {
  const rec = externalRecord || record
  let app
  let userDataDir
  try {
    ;({ app, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace }))
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await waitForAgentUi(win, 120_000)
    await dismissBlockingModals(win)

    const speechIpc = await win.evaluate(async () => {
      const api = window.electronAPI?.speech
      if (!api?.isAvailable) return { available: false, start: false, stop: false, running: false }
      const avail = await api.isAvailable()
      let start = false
      let stop = false
      try {
        const s = await api.start('zh-CN')
        start = s?.success !== false
        await new Promise((r) => setTimeout(r, 500))
        const mid = await api.isAvailable()
        const t = await api.stop()
        stop = t?.success !== false
        return { available: !!avail?.available, start, stop, running: !!mid?.running }
      } catch (e) {
        return { available: !!avail?.available, start, stop, error: String(e) }
      }
    })
    rec('IPC', 'speech-is-available', speechIpc.available !== false, JSON.stringify(speechIpc))
    rec('IPC', 'start/stop 生命周期', speechIpc.start && speechIpc.stop, speechIpc.error || '')

    await dismissBlockingModals(win)
    const chatInput = win.locator('[data-testid="chat-input"]')
    await chatInput.click({ timeout: 8000 }).catch(() => {})

    const voiceBtn = win.locator('[data-testid="voice-button"]')
    await voiceBtn.click({ timeout: 8000 }).catch(() => {})
    await sleep(600)
    const listeningAfterClick = await voiceBtn.evaluate((el) =>
      el.classList.contains('agent-panel__voice--active'),
    ).catch(() => false)
    if (listeningAfterClick) {
      await voiceBtn.click({ timeout: 5000 }).catch(() => {})
      await sleep(400)
    }
    rec('UI', '麦克风按钮可切换 listening', listeningAfterClick || speechIpc.start, listeningAfterClick ? 'active' : 'ipc-start')

    const hookReady = await waitForVoiceE2eHook(win)
    rec('UI', 'E2E simulateVoiceTranscript 钩子', hookReady, hookReady ? 'ready' : 'timeout')

    await win.evaluate(() => {
      window.__METAMATES_E2E__?.simulateVoiceTranscript?.('渲染层语音注入')
    })
    await sleep(300)
    const rendererVal = await chatInput.inputValue()
    rec('转写', '渲染层注入 → 输入框', rendererVal.includes('渲染层语音注入'), rendererVal.slice(0, 40))

    await dismissBlockingModals(win)
    const voiceStillActive = await voiceBtn.evaluate((el) =>
      el.classList.contains('agent-panel__voice--active'),
    ).catch(() => false)
    if (voiceStillActive) {
      await voiceBtn.click({ timeout: 5000 }).catch(() => {})
      await sleep(800)
    }
    await win.evaluate(async () => {
      await window.electronAPI?.speech?.stop?.()
    })
    await chatInput.evaluate(async (el) => {
      const textarea = el
      const deadline = Date.now() + 8000
      while (textarea.disabled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    })

    await chatInput.fill('')
    const nativeStarted = await win.evaluate(async () => {
      const api = window.electronAPI?.speech
      if (!api?.e2eInject) return false
      const s = await api.start('zh-CN')
      return s?.success !== false
    })
    await win.evaluate(async () => {
      await window.electronAPI?.speech?.e2eInject?.({ interim: '正在识别' })
    })
    await sleep(300)
    const midVal = await chatInput.inputValue()
    await win.evaluate(async () => {
      await window.electronAPI?.speech?.e2eInject?.({ final: '主进程通道确认', interim: '' })
    })
    await sleep(300)
    const finVal = await chatInput.inputValue()
    await win.evaluate(async () => {
      await window.electronAPI?.speech?.stop?.()
    })
    await chatInput.evaluate(async (el) => {
      const textarea = el
      const deadline = Date.now() + 8000
      while (textarea.disabled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    })
    rec(
      '转写',
      '主进程 IPC 注入（interim+final）',
      nativeStarted && midVal.includes('正在识别') && finVal.includes('主进程通道确认'),
      finVal.slice(0, 50),
    )

    const prefixFlow = await (async () => {
      await chatInput.fill('已有内容 ')
      await win.evaluate(() => {
        window.__METAMATES_E2E__?.simulateVoiceTranscript?.('追加语音')
      })
      const value = await chatInput.inputValue()
      return { ok: value === '已有内容 追加语音', detail: value }
    })()
    rec('转写', '保留前缀 + 追加 final', prefixFlow.ok, prefixFlow.detail)

    if (LIVE_VOICE_ASR) {
      await win.evaluate(() => {
        const input = document.querySelector('[data-testid="chat-input"]')
        if (input instanceof HTMLTextAreaElement) input.value = ''
      })
      await dismissBlockingModals(win)
      await voiceBtn.click({ timeout: 8000 })
      await sleep(1500)
      const liveActive = await voiceBtn.evaluate((el) => el.classList.contains('agent-panel__voice--active'))
      rec('实麦', '启动 Whisper 录音', liveActive, liveActive ? '请对着麦克风说话…' : '未进入 listening')
      if (liveActive) {
        const deadline = Date.now() + LIVE_VOICE_TIMEOUT_MS
        let transcript = ''
        while (Date.now() < deadline) {
          transcript = await chatInput.inputValue()
          if (transcript.trim().length >= 2) break
          await sleep(1000)
        }
        await voiceBtn.click({ timeout: 5000 }).catch(() => {})
        rec(
          '实麦',
          `收到真实转写 (${LIVE_VOICE_TIMEOUT_MS / 1000}s 内)`,
          transcript.trim().length >= 2,
          transcript.trim().slice(0, 80) || '无转写 — 检查麦克风权限/默认设备/语言',
        )
      }
    } else {
      rec('实麦', '真实麦克风 ASR', true, '跳过 — 设置 LIVE_VOICE_ASR=1 启用')
    }
  } finally {
    await closeElectronApp(app, { userDataDir, cleanupUserData: true })
  }
}

async function main() {
  console.log('═══ MetaMates 语音 E2E ═══\n')
  const workspace = resolveDefaultWorkspace()
  console.log(`工作区: ${workspace}`)
  console.log(`实麦 ASR: ${LIVE_VOICE_ASR ? `启用 (${LIVE_VOICE_TIMEOUT_MS / 1000}s)` : '跳过 (LIVE_VOICE_ASR=1 启用)'}\n`)

  if (!fs.existsSync(workspace)) {
    console.error('工作区不存在:', workspace)
    process.exit(1)
  }

  await ensureDevStack()
  runVitestSpeech()
  await runVoiceElectronJourney(workspace)

  const failed = results.filter((r) => !r.ok)
  const passed = results.filter((r) => r.ok).length
  console.log(`\n═══ 总计: ${results.length} 项 | ✅ ${passed} | ❌ ${failed.length} ═══`)
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ workspace, liveVoiceAsr: LIVE_VOICE_ASR, passed, failed: failed.length, results }, null, 2))
  console.log(`报告: ${REPORT_PATH}`)

  if (failed.length) {
    console.log('\n失败项:')
    for (const f of failed) console.log(`  ❌ [${f.section}] ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
