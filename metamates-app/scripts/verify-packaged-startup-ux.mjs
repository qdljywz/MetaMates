#!/usr/bin/env node
/**
 * Real-user packaged startup probe: fresh userData, no E2E workspace seed.
 * Reports splash visibility, shell timing, and renderer errors.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE =
  process.env.METAMATES_PACKAGED_EXE?.trim() ||
  path.join(ROOT, 'release-fresh2', 'win-unpacked', 'MetaMates.exe')

if (!fs.existsSync(EXE)) {
  console.error('[startup-probe] Missing exe:', EXE)
  process.exit(1)
}

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-real-startup-'))
const userDataDir = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(userDataDir, { recursive: true })

const report = {
  exe: EXE,
  userDataDir,
  errors: [],
  console: [],
  timeline: [],
}

function mark(phase, detail) {
  const entry = { phase, detail, atMs: Date.now() - t0 }
  report.timeline.push(entry)
  console.log(`[startup-probe] +${entry.atMs}ms ${phase}${detail ? ` — ${detail}` : ''}`)
}

const t0 = Date.now()
let app

try {
  mark('launch')
  app = await electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${userDataDir}`],
    timeout: 120_000,
    env: { ...process.env, METAMATES_E2E: '1' },
  })

  app.on('window', () => mark('window-event'))

  const page = await app.firstWindow()
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    report.console.push(line)
    if (msg.type() === 'error') report.errors.push(line)
  })
  page.on('pageerror', (err) => {
    const line = `[pageerror] ${err.message}`
    report.errors.push(line)
    console.error(line)
  })

  // Boot splash (inline HTML, no testid)
  for (let i = 0; i < 40; i++) {
    const boot = await page.locator('#boot-splash').isVisible().catch(() => false)
    if (boot) {
      mark('boot-splash-visible')
      break
    }
    await page.waitForTimeout(250)
  }

  // React splash
  for (let i = 0; i < 60; i++) {
    const react = await page.locator('[data-testid="startup-splash"]').isVisible().catch(() => false)
    if (react) {
      mark('react-splash-visible')
      break
    }
    await page.waitForTimeout(250)
  }

  // Shell or error UI
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const shell = await page.locator('.status-bar').isVisible().catch(() => false)
    const errBoundary = await page.getByText(/出了点问题|Something went wrong|errorBoundary/i).isVisible().catch(() => false)
    const loadErr = await page.getByText(/界面加载失败|UI failed to load/i).isVisible().catch(() => false)
    const picker = await page.locator('.ant-modal-wrap').filter({ hasText: /选择工作区|Select Workspace/i }).isVisible().catch(() => false)
    const wizard = await page.locator('[data-testid="welcome-wizard"]').isVisible().catch(() => false)
    const engine = await page.locator('[data-testid="engine-setup-flow"]').isVisible().catch(() => false)
    const notResponding = !(await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      return w && !w.isDestroyed()
    }).catch(() => true))

    if (shell) {
      mark('shell-visible')
      break
    }
    if (errBoundary) {
      mark('error-boundary')
      break
    }
    if (loadErr) {
      mark('load-error-page')
      break
    }
    if (picker) {
      mark('workspace-picker')
      break
    }
    if (wizard) {
      mark('welcome-wizard')
      break
    }
    if (engine) {
      mark('engine-setup')
      break
    }
    await page.waitForTimeout(500)
  }

  const screenshot = path.join(freshRoot, 'startup-probe.png')
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {})
  report.screenshot = screenshot

  const final = {
    bootSplash: await page.locator('#boot-splash').isVisible().catch(() => false),
    reactSplash: await page.locator('[data-testid="startup-splash"]').isVisible().catch(() => false),
    shell: await page.locator('.status-bar').isVisible().catch(() => false),
    url: page.url(),
    title: await page.title().catch(() => ''),
  }
  report.final = final
  mark('done', JSON.stringify(final))

  const ok =
    (final.shell || report.timeline.some((t) => ['workspace-picker', 'welcome-wizard', 'engine-setup'].includes(t.phase))) &&
    report.errors.length === 0

  const out = path.join(ROOT, 'packaged-startup-probe.json')
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log('[startup-probe] Report:', out)

  if (!ok) {
    console.error('[startup-probe] FAIL')
    process.exit(1)
  }
  console.log('[startup-probe] PASS')
} catch (err) {
  console.error('[startup-probe] CRASH:', err)
  process.exit(1)
} finally {
  try {
    if (app) await app.close()
  } catch {
    /* ignore */
  }
  const { removeTempPath } = await import('./lib/remove-temp-path.mjs')
  removeTempPath(freshRoot, { label: 'startup-probe' })
}
