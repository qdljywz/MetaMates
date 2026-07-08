#!/usr/bin/env node
/**
 * 视觉与对比度走查 — 深色模式为主，模拟用户操作并检测文字/背景可读性
 *
 * 用法:
 *   node scripts/dark-mode-ui-audit.mjs
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/dark-mode-ui-audit.mjs
 */
import { _electron as electron } from '@playwright/test'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'
import {
  closeElectronApp,
  dismissBlockingModals,
  launchElectronApp,
  openCommandPaletteE2e,
  sleep,
} from './lib/electron-e2e-lifecycle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'dark-mode-ui-audit-report.json')
const SHOTS_DIR = path.join(ROOT, 'test-results', 'dark-mode-audit')

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

async function closeModals(win) {
  await dismissBlockingModals(win)
}

async function auditShellContrast(win) {
  const checks = [
    ['主界面', '状态栏文字', '.status-bar', 3],
    ['主界面', '标题栏副标题', '.title-bar .ant-typography-secondary', 4.5],
    ['主界面', '文件树节点', '[data-testid="file-tree"] .ant-tree-title', 4.5],
    ['主界面', '标签页文字', '.tab-bar', 4.5],
    ['主界面', '编辑器文字', '.cm-content', 4.5],
    ['Agent', '连接状态 pill', '[data-testid="acp-connection-status"]', 3],
    ['Agent', 'slash 命令 chip', '[data-testid^="slash-chip-"]', 3],
  ]
  for (const [section, name, selector, min] of checks) {
    recordContrast(section, name, await measureContrast(win, selector), min)
  }
}

async function openHelpModal(win) {
  await closeModals(win)
  const btn = win.locator('[data-testid="help-button"]')
  if (await btn.count()) {
    await btn.click({ force: true, timeout: 8000 })
  } else {
    await win.locator('.anticon-question-circle').first().click({ force: true, timeout: 5000 }).catch(() => {})
  }
  await sleep(1000)
  return win.locator('.ant-modal-wrap').filter({ hasText: /帮助|Help|快速入门|Quick Start/i }).isVisible().catch(() => false)
}

/** 在渲染进程内计算前景/背景对比度 (WCAG) */
function recordContrast(section, name, result, minRatio = 4.5) {
  if (!result.found) {
    record(section, name, true, 'element not found (skipped)')
    return
  }
  const ok = (result.ratio ?? 0) >= minRatio
  record(section, name, ok, `ratio=${result.ratio} min=${minRatio}`)
}

async function measureContrast(win, selector) {
  return win.evaluate((sel) => {
    const parseRgb = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) return null
      return [Number(m[1]), Number(m[2]), Number(m[3])]
    }
    const luminance = ([r, g, b]) => {
      const conv = [r, g, b].map((v) => {
        const n = v / 255
        return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * conv[0] + 0.7152 * conv[1] + 0.0722 * conv[2]
    }
    const contrastRatio = (fg, bg) => {
      const l1 = luminance(fg)
      const l2 = luminance(bg)
      const lighter = Math.max(l1, l2)
      const darker = Math.min(l1, l2)
      return (lighter + 0.05) / (darker + 0.05)
    }
    const getBg = (el) => {
      let node = el
      while (node) {
        const bg = getComputedStyle(node).backgroundColor
        const rgb = parseRgb(bg)
        if (rgb && (rgb[0] + rgb[1] + rgb[2] > 10 || bg.includes('0.0') === false)) {
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return rgb
        }
        node = node.parentElement
      }
      const body = parseRgb(getComputedStyle(document.body).backgroundColor)
      return body || [24, 24, 27]
    }

    const el = document.querySelector(sel)
    if (!el) return { found: false, selector: sel }

    const fg = parseRgb(getComputedStyle(el).color)
    const bg = getBg(el)
    if (!fg || !bg) return { found: true, selector: sel, error: 'unparsed color' }

    return {
      found: true,
      selector: sel,
      color: getComputedStyle(el).color,
      background: bg.join(','),
      ratio: Math.round(contrastRatio(fg, bg) * 100) / 100,
    }
  }, selector)
}

async function auditQrContrast(win) {
  return win.evaluate(() => {
    const wrap = document.querySelector('.settings-qr-wrap')
    const canvas = wrap?.querySelector('canvas')
    if (!canvas) return { found: false }

    const ctx = canvas.getContext('2d')
    if (!ctx) return { found: true, error: 'no ctx' }

    const { width, height } = canvas
    const data = ctx.getImageData(0, 0, width, height).data
    let dark = 0
    let light = 0
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (lum < 128) dark++
      else light++
    }
    const total = dark + light
    return {
      found: true,
      darkRatio: Math.round((dark / total) * 100),
      lightRatio: Math.round((light / total) * 100),
      scannable: dark > 100 && light > 100,
    }
  })
}

async function enableVaultApiQr(win) {
  const modal = win.locator('.ant-modal-wrap').filter({ hasText: /设置|Settings/i })
  if (!(await modal.isVisible().catch(() => false))) return false

  const switches = modal.locator('.ant-switch')
  const count = await switches.count()
  for (let i = 0; i < count; i++) {
    const sw = switches.nth(i)
    const checked = await sw.evaluate((el) => el.classList.contains('ant-switch-checked'))
    if (!checked) {
      await sw.click({ force: true }).catch(() => {})
      await sleep(200)
    }
  }
  await sleep(800)
  return true
}

async function runAudit() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const workspace = prepareWorkspace()
  await ensureDevStack()

  if (process.platform === 'win32' && process.env.METAMATES_KILL_ELECTRON === '1') {
    // optional: only when explicitly requested
  }

  let app
  let userDataDir
  try {
    ;({ app, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace }))
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('[data-testid="agent-toolbar"]', { timeout: 120_000 }).catch(() => {})
    await closeModals(win)
    await sleep(1000)

    await win.evaluate(async () => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.body.style.background = '#18181b'
      document.body.style.color = '#fafafa'
      const api = window.electronAPI
      if (api?.saveSettings) {
        await api.saveSettings({ theme: 'dark', colorScheme: 'default' })
      }
    })
    await sleep(500)

    const theme = await win.evaluate(() => document.documentElement.getAttribute('data-theme'))
    record('主题', 'data-theme 为 dark', theme === 'dark', `theme=${theme}`)

    await auditShellContrast(win)
    await win.screenshot({ path: path.join(SHOTS_DIR, '00-main-shell.png') })

    // --- 设置 ---
    await closeModals(win)
    await win.locator('.anticon-setting').first().click({ force: true })
    await sleep(800)
    const settingsOpen = await win.locator('.ant-modal-wrap').filter({ hasText: /设置|Settings/i }).isVisible()
    record('用户操作', '打开设置', settingsOpen)
    if (settingsOpen) {
      await win.screenshot({ path: path.join(SHOTS_DIR, '01-settings.png') })

      const cancelContrast = await measureContrast(win, '.ant-modal-footer .ant-btn-default')
      recordContrast('对比度', '设置·取消按钮', cancelContrast, 3)

      const hintContrast = await measureContrast(win, '.ant-modal-wrap .ant-typography-secondary')
      recordContrast('对比度', '设置·次要文字', hintContrast, 4.5)

      await enableVaultApiQr(win)
      const qr = await auditQrContrast(win)
      if (qr.found) {
        record('二维码', '深浅模块分布', qr.scannable === true, `dark=${qr.darkRatio}% light=${qr.lightRatio}%`)
        await win.screenshot({ path: path.join(SHOTS_DIR, '02-settings-qr.png') })
      } else {
        record('二维码', 'Vault API QR 区域', true, 'skipped (API 未运行或无 LAN URL)')
      }

      await closeModals(win)
    }

    // --- 帮助 ---
    const helpOpen = await openHelpModal(win)
    record('用户操作', '打开帮助', helpOpen)
    if (helpOpen) {
      await win.screenshot({ path: path.join(SHOTS_DIR, '03-help.png') })
      recordContrast('对比度', '帮助·页脚文字', await measureContrast(win, '.ant-modal-wrap div[style*="text-align: center"]'), 4.5)
      const tabContrast = await measureContrast(win, '.ant-modal-wrap .ant-tabs-tab')
      recordContrast('对比度', '帮助·标签页', tabContrast, 4.5)
      await closeModals(win)
    }

    // --- 命令面板 ---
    const paletteOpen = await openCommandPaletteE2e(win)
    record('用户操作', 'Ctrl+P 命令面板', paletteOpen)
    if (paletteOpen) {
      await win.screenshot({ path: path.join(SHOTS_DIR, '04-command-palette.png') })
      recordContrast('对比度', '命令面板·输入框文字', await measureContrast(win, '.ant-modal-wrap .ant-input'), 4.5)
      recordContrast('对比度', '命令面板·快捷键提示', await measureContrast(win, '.command-palette-hints'), 4.5)
      recordContrast('对比度', '命令面板·列表项描述', await measureContrast(win, '.ant-modal-wrap .ant-typography-secondary'), 4.5)
      await closeModals(win)
    }

    // --- 全局搜索 ---
    await closeModals(win)
    const searchBtn = win.locator('[data-testid="activity-search"]')
    if (await searchBtn.count()) {
      await searchBtn.click({ timeout: 5000 }).catch(() => {})
    } else {
      await win.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true }))
      })
    }
    await sleep(900)
    const searchOpen = await win.locator('.ant-modal-wrap').filter({ hasText: /搜索|Search/i }).first().isVisible().catch(() => false)
    record('用户操作', '打开全局搜索', searchOpen)
    if (searchOpen) {
      await win.screenshot({ path: path.join(SHOTS_DIR, '05-global-search.png') })
      recordContrast('对比度', '全局搜索·输入框', await measureContrast(win, '.ant-modal-wrap .ant-input'), 4.5)
      recordContrast('对比度', '全局搜索·空状态提示', await measureContrast(win, '.ant-modal-wrap .ant-empty-description, .ant-modal-wrap div[style*="padding: 40"]'), 3)
      await closeModals(win)
    }

    // --- Agent 输入 ---
    await win.waitForSelector('[data-testid="chat-input"]', { timeout: 30_000 }).catch(() => {})
    const placeholderContrast = await win.evaluate(() => {
      const input = document.querySelector('[data-testid="chat-input"]')
      if (!input) return { found: false }
      const style = getComputedStyle(input, '::placeholder')
      const phColor = style.color
      const bg = getComputedStyle(input).backgroundColor
      const parse = (c) => {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
      }
      const lum = ([r, g, b]) => {
        const conv = [r, g, b].map((v) => {
          const n = v / 255
          return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * conv[0] + 0.7152 * conv[1] + 0.0722 * conv[2]
      }
      const fg = parse(phColor)
      const background = parse(bg)
      if (!fg || !background) return { found: true, error: 'parse fail' }
      const l1 = lum(fg)
      const l2 = lum(background)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      return { found: true, ratio: Math.round(ratio * 100) / 100, phColor, bg }
    })
    const phOk = !placeholderContrast.found || (placeholderContrast.ratio ?? 0) >= 3
    record('对比度', 'Agent 输入 placeholder', phOk,
      placeholderContrast.found ? `ratio=${placeholderContrast.ratio}` : 'input not found')
    await win.screenshot({ path: path.join(SHOTS_DIR, '06-agent-panel.png') })

    const noCrash = await win.evaluate(() => {
      const text = document.body?.innerText || ''
      return !text.includes('object is not extensible') && !text.includes('出了点问题')
    })
    record('稳定性', 'Agent 面板无崩溃', noCrash)

    // --- 活动栏弹窗 ---
    for (const [testId, label, shot] of [
      ['activity-graph', '知识图谱', '07-graph'],
      ['activity-template', '模板选择', '08-template'],
    ]) {
      await closeModals(win)
      const btn = win.locator(`[data-testid="${testId}"]`)
      if (await btn.count()) {
        await btn.click({ timeout: 5000 }).catch(() => {})
        await sleep(900)
        const open = testId === 'activity-graph'
          ? await win.locator('.graph-modal').first().isVisible().catch(() => false)
          : await win.locator('.template-selector-modal, .ant-modal').filter({ hasText: /模板|Template/i }).first().isVisible().catch(() => false)
        record('用户操作', `活动栏·${label}`, open)
        if (open) {
          await win.screenshot({ path: path.join(SHOTS_DIR, `${shot}.png`) })
          if (testId === 'activity-template') {
            recordContrast('对比度', '模板·卡片标题', await measureContrast(win, '.template-selector__card .ant-typography'), 4.5)
            recordContrast('对比度', '模板·预览区文字', await measureContrast(win, '.template-selector__preview-pane'), 4.5)
            const firstCard = win.locator('.template-selector__card').first()
            if (await firstCard.count()) {
              await firstCard.click()
              await sleep(400)
              recordContrast('对比度', '模板·预览 pre', await measureContrast(win, '.template-selector__pre'), 4.5)
            }
          }
        }
        await closeModals(win)
      }
    }

    await win.screenshot({ path: path.join(SHOTS_DIR, '09-main-final.png') })
  } finally {
    await closeElectronApp(app, { userDataDir, cleanupUserData: true })
  }

  const failed = results.filter((r) => !r.ok)
  const summary = {
    at: new Date().toISOString(),
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    screenshots: SHOTS_DIR,
    results,
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2))
  console.log(`\n报告: ${REPORT_PATH}`)
  console.log(`截图: ${SHOTS_DIR}`)
  console.log(`通过 ${summary.passed}/${summary.total}`)
  if (failed.length) {
    console.log('未通过项:')
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}: ${f.detail}`)
    process.exitCode = 1
  }
}

runAudit().catch((err) => {
  console.error(err)
  process.exit(1)
})
