#!/usr/bin/env node
/**
 * Theme palette visual audit — paper / cold light + dark, with aesthetics checks.
 *
 *   node scripts/theme-palette-visual-audit.mjs
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
  sleep,
} from './lib/electron-e2e-lifecycle.mjs'
import { bootstrapAuditTheme } from './lib/ui-audit-theme.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'theme-palette-visual-audit-report.json')
const SHOTS_DIR = path.join(ROOT, 'test-results', 'theme-palette-audit')

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

function luminance(hex) {
  const raw = hex.replace('#', '')
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

async function readCanvasTokens(win) {
  return win.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const fileTree = document.querySelector('[data-testid="file-tree"]')
    const editor = document.querySelector('.editor-area')
    const treeBg = fileTree ? getComputedStyle(fileTree.closest('.file-tree-column') || fileTree).backgroundColor : ''
    const editorBg = editor ? getComputedStyle(editor).backgroundColor : ''
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      palette: document.documentElement.getAttribute('data-light-palette'),
      canvasBase: style.getPropertyValue('--canvas-base').trim(),
      canvasSurface: style.getPropertyValue('--canvas-surface').trim(),
      treeBg,
      editorBg,
    }
  })
}

async function auditVariant(win, label, themeMode, lightPalette) {
  await bootstrapAuditTheme(win, themeMode, { lightPalette })
  await sleep(600)

  const tokens = await readCanvasTokens(win)
  const prefix = label

  record(prefix, 'data-theme', tokens.theme === (themeMode === 'system' ? tokens.theme : themeMode), `theme=${tokens.theme}`)
  if (themeMode === 'light') {
    record(prefix, 'data-light-palette', tokens.palette === lightPalette, `palette=${tokens.palette}`)
    record(prefix, 'canvas-base token', tokens.canvasBase.length > 0, tokens.canvasBase)
    record(prefix, 'canvas-surface token', tokens.canvasSurface.length > 0, tokens.canvasSurface)
  }

  if (themeMode === 'light' && lightPalette === 'paper') {
    const baseLum = luminance(tokens.canvasBase || '#f0eeea')
    const surfaceLum = luminance(tokens.canvasSurface || '#f7f6f2')
    record(prefix, '美学·暖纸 base 非纯白', baseLum < 0.96, `L=${baseLum.toFixed(3)}`)
    record(prefix, '美学·编辑区略亮于侧栏', surfaceLum > baseLum, `surface=${surfaceLum.toFixed(3)} base=${baseLum.toFixed(3)}`)
  }

  if (themeMode === 'light' && lightPalette === 'cold') {
    const surfaceLum = luminance(tokens.canvasSurface || '#ffffff')
    record(prefix, '美学·冷白 surface 高亮', surfaceLum >= 0.98, `L=${surfaceLum.toFixed(3)}`)
    const hierarchy = tokens.canvasBase !== tokens.canvasSurface
    record(prefix, '美学·树/编辑区分层', hierarchy, `${tokens.canvasBase} vs ${tokens.canvasSurface}`)
  }

  if (themeMode === 'dark') {
    const baseLum = luminance(tokens.canvasBase || '#18181b')
    record(prefix, '美学·深色底足够暗', baseLum < 0.08, `L=${baseLum.toFixed(3)}`)
  }

  const subtitleContrast = await win.evaluate(() => {
    const el = document.querySelector('.title-bar .ant-typography-secondary')
    if (!el) return null
    const fg = getComputedStyle(el).color
    const bg = getComputedStyle(el.closest('.title-bar') || document.body).backgroundColor
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) return '#000000'
      const hex = (n) => Number(n).toString(16).padStart(2, '0')
      return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
    }
    return { fg: parse(fg), bg: parse(bg) }
  })
  if (subtitleContrast?.fg && subtitleContrast?.bg) {
    const ratio = contrastRatio(subtitleContrast.fg, subtitleContrast.bg)
    record(prefix, '对比度·标题副标题', ratio >= 4.5, `ratio=${ratio.toFixed(2)}`)
  }

  const brandGradient = await win.evaluate(() => {
    const el = document.querySelector('.title-bar-brand-name, .brand-gradient-text')
    if (!el) return false
    const bg = getComputedStyle(el).backgroundImage
    return bg.includes('linear-gradient') || bg.includes('gradient')
  })
  record(prefix, '美学·品牌渐变字', brandGradient === true, brandGradient ? 'present' : 'missing')

  const activityColors = await win.evaluate(() => {
    const vault = document.querySelector('[data-testid="activity-new-note"], [data-testid="activity-workspace"]')
    const explore = document.querySelector('[data-testid="activity-search"], [data-testid="activity-graph"]')
    if (!vault || !explore) return null
    const vaultColor = getComputedStyle(vault).color
    const exploreColor = getComputedStyle(explore).color
    return { vaultColor, exploreColor, distinct: vaultColor !== exploreColor }
  })
  if (activityColors) {
    record(prefix, '美学·活动栏 A/B 色', activityColors.distinct === true, `${activityColors.vaultColor} / ${activityColors.exploreColor}`)
  }

  await dismissBlockingModals(win)
  const shotName = `${label.replace(/\s+/g, '-').toLowerCase()}-main.png`
  await win.screenshot({ path: path.join(SHOTS_DIR, shotName), fullPage: false })

  await win.locator('.anticon-setting').first().click({ force: true, timeout: 5000 }).catch(() => {})
  await sleep(700)
  const settingsVisible = await win.locator('.ant-modal-wrap').filter({ hasText: /设置|Settings/i }).isVisible({ timeout: 3000 }).catch(() => false)
  if (settingsVisible) {
    await win.screenshot({ path: path.join(SHOTS_DIR, `${label.replace(/\s+/g, '-').toLowerCase()}-settings.png`) })
    await dismissBlockingModals(win)
  }
}

async function runAudit() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const workspace = resolveDefaultWorkspace()
  await ensureDevStack()

  let app
  let userDataDir
  try {
    ;({ app, userDataDir } = await launchElectronApp(electron, { cwd: ROOT, workspace }))
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('[data-testid="agent-toolbar"]', { timeout: 120_000 }).catch(() => {})
    await dismissBlockingModals(win)
    await sleep(800)

    await auditVariant(win, 'paper-light', 'light', 'paper')
    await auditVariant(win, 'cold-light', 'light', 'cold')
    await auditVariant(win, 'dark', 'dark', 'paper')

    const passed = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    const report = {
      summary: { passed, total: results.length, failed: failed.length },
      aestheticsNotes: [
        'paper: warm hierarchy, lower glare',
        'cold: crisp white editor, stronger tree/editor separation',
        'dark: brand orange/teal on zinc base',
      ],
      results,
      screenshots: SHOTS_DIR,
    }
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
    console.log(`\n报告: ${REPORT_PATH}`)
    console.log(`截图: ${SHOTS_DIR}`)
    console.log(`通过 ${passed}/${results.length}`)
    if (failed.length) {
      console.log('未通过项:')
      for (const f of failed) console.log(`  - [${f.section}] ${f.name}: ${f.detail}`)
      process.exitCode = 1
    }
  } finally {
    await closeElectronApp(app, userDataDir)
  }
}

runAudit().catch((err) => {
  console.error(err)
  process.exit(1)
})
