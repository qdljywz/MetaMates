#!/usr/bin/env node
/**
 * Packaged startup audit: timeline, screenshots, expected-vs-actual report.
 *
 * Scenarios:
 *  1. fresh-user — empty userData, no workspace (expect picker/wizard/splash, not stuck black)
 *  2. e2e-user   — METAMATES_E2E=1 + E2E vault seed (expect shell within budget)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const E2E_WORKSPACE = resolveDefaultWorkspace()
const EXE =
  process.env.METAMATES_PACKAGED_EXE?.trim() ||
  path.join(ROOT, 'release-startup', 'win-unpacked', 'MetaMates.exe')

/** Keep in sync with src/utils/startupUx.ts STARTUP_FORCE_ENTER_MS (5500) */
const STARTUP_FORCE_ENTER_MS = 5_500

/** Product design: 5s splash cycle + cold-start slack on Windows packaged exe */
const PRODUCT_SHELL_BUDGET_MS = STARTUP_FORCE_ENTER_MS + 8_000
const PRODUCT_FIRST_SPLASH_MS = 12_000

const EXPECT = {
  fresh: {
    maxMsToInteractive: PRODUCT_SHELL_BUDGET_MS,
    maxMsToFirstSplash: PRODUCT_FIRST_SPLASH_MS,
    acceptPhases: ['workspace-picker', 'welcome-wizard', 'react-splash-visible', 'boot-splash-visible', 'shell-visible', 'engine-setup'],
    rejectPhases: ['load-error-page', 'error-boundary'],
    description: `首次用户：${PRODUCT_FIRST_SPLASH_MS / 1000}s 内见启动动画，${PRODUCT_SHELL_BUDGET_MS / 1000}s 内进入交互界面`,
  },
  e2e: {
    maxMsToShell: PRODUCT_SHELL_BUDGET_MS,
    maxMsToFirstSplash: PRODUCT_FIRST_SPLASH_MS,
    acceptPhases: ['shell-visible'],
    rejectPhases: ['load-error-page', 'error-boundary'],
    description: `老用户(E2E vault)：${PRODUCT_SHELL_BUDGET_MS / 1000}s 内进入主界面(status-bar)`,
  },
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

async function snapshot(page, dir, label, t0) {
  const file = path.join(dir, `${String(Date.now() - t0).padStart(6, '0')}ms-${label}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  return file
}

async function readUiState(page) {
  return {
    bootSplash: await page.locator('#boot-splash').isVisible().catch(() => false),
    reactSplash: await page.locator('[data-testid="startup-splash"]').isVisible().catch(() => false),
    shell: await page.locator('.status-bar').isVisible().catch(() => false),
    picker: await page
      .locator('.ant-modal-wrap')
      .filter({ hasText: /选择工作区|Select Workspace/i })
      .isVisible()
      .catch(() => false),
    wizard: await page.locator('[data-testid="welcome-wizard"]').isVisible().catch(() => false),
    engine: await page.locator('[data-testid="engine-setup-flow"]').isVisible().catch(() => false),
    loadErr: await page.getByText(/界面加载失败|UI failed to load/i).isVisible().catch(() => false),
    errBoundary: await page.getByText(/出了点问题|Something went wrong/i).isVisible().catch(() => false),
    url: page.url(),
  }
}

function seedE2EProfile(userDataDir, workspace = E2E_WORKSPACE) {
  ensureDir(userDataDir)
  const settings = {
    workspacePath: workspace,
    theme: 'dark',
    fontSize: 14,
    autoSave: true,
    language: 'zh',
    engineSetupStatus: 'ready',
  }
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

async function runScenario(name, options) {
  const auditRoot = path.join(ROOT, 'startup-audit', `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  ensureDir(auditRoot)
  const userDataDir = path.join(auditRoot, 'userData')
  ensureDir(userDataDir)

  if (options.seedE2E) seedE2EProfile(userDataDir, options.workspace)

  const report = {
    scenario: name,
    exe: EXE,
    userDataDir,
    auditRoot,
    expected: EXPECT[name === 'e2e-user' ? 'e2e' : 'fresh'],
    timeline: [],
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    final: null,
    pass: false,
    notes: [],
  }

  const t0 = Date.now()
  const mark = (phase, detail, page, shotLabel) => {
    const atMs = Date.now() - t0
    report.timeline.push({ phase, detail, atMs })
    console.log(`[audit:${name}] +${atMs}ms ${phase}${detail ? ` — ${detail}` : ''}`)
    if (page && shotLabel) {
      return snapshot(page, auditRoot, shotLabel, t0).then((f) => {
        report.screenshots.push({ atMs, label: shotLabel, file: f })
      })
    }
    return Promise.resolve()
  }

  let app
  try {
    if (!fs.existsSync(EXE)) throw new Error(`Missing exe: ${EXE}`)

    await mark('launch')
    app = await electron.launch({
      executablePath: EXE,
      args: [`--user-data-dir=${userDataDir}`],
      timeout: 180_000,
      env: {
        ...process.env,
        // E2E=1: skip single-instance lock + stale-process cleanup during automation
        METAMATES_E2E: '1',
        ...(options.seedE2E ? { METAMATES_WORKSPACE: options.workspace || E2E_WORKSPACE } : {}),
      },
    })

    let page = null
    const windowDeadline = Date.now() + 130_000
    while (Date.now() < windowDeadline) {
      const wins = app.windows()
      if (wins.length > 0) {
        page = wins[0]
        break
      }
      await Promise.race([
        app.waitForEvent('window', { timeout: 2000 }).catch(() => null),
        new Promise((r) => setTimeout(r, 500)),
      ])
    }
    if (!page) throw new Error('No BrowserWindow within 130s (likely black/stuck renderer)')
    await mark('window-attached', page.url())
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => report.pageErrors.push(err.message))

    const shotTimes = new Set([2000, 5000, 8000, 12000])
    let lastPhase = ''
    const deadline = t0 + (options.seedE2E ? EXPECT.e2e.maxMsToShell : EXPECT.fresh.maxMsToInteractive) + 15_000
    let interactivePhase = null

    while (Date.now() < deadline) {
      const elapsed = Date.now() - t0
      const ui = await readUiState(page)

      for (const t of shotTimes) {
        if (elapsed >= t && !report.screenshots.some((s) => s.label === `t${t}`)) {
          shotTimes.delete(t)
          await snapshot(page, auditRoot, `t${t}`, t0).then((f) => {
            report.screenshots.push({ atMs: elapsed, label: `t${t}`, file: f, ui: { ...ui } })
          })
        }
      }

      let phase = null
      if (ui.shell) phase = 'shell-visible'
      else if (ui.picker) phase = 'workspace-picker'
      else if (ui.wizard) phase = 'welcome-wizard'
      else if (ui.engine) phase = 'engine-setup'
      else if (ui.loadErr) phase = 'load-error-page'
      else if (ui.errBoundary) phase = 'error-boundary'
      else if (ui.reactSplash) phase = 'react-splash-visible'
      else if (ui.bootSplash) phase = 'boot-splash-visible'

      if (phase && phase !== lastPhase) {
        lastPhase = phase
        await mark(phase, JSON.stringify(ui), page, phase)
      }

      const exp = options.seedE2E ? EXPECT.e2e : EXPECT.fresh
      if (exp.acceptPhases.includes(phase) && !interactivePhase) {
        interactivePhase = phase
        if (options.seedE2E && phase === 'shell-visible') break
        if (!options.seedE2E && ['workspace-picker', 'welcome-wizard', 'shell-visible', 'engine-setup'].includes(phase)) {
          break
        }
      }
      if (exp.rejectPhases.includes(phase)) break

      if (!options.seedE2E && elapsed > EXPECT.fresh.maxMsToInteractive && ui.reactSplash && !ui.picker && !ui.wizard && !ui.shell) {
        report.notes.push(`超过 ${EXPECT.fresh.maxMsToInteractive}ms 仍只在启动动画，未进入交互界面`)
        break
      }

      await page.waitForTimeout(400)
    }

    report.final = await readUiState(page)
    await snapshot(page, auditRoot, 'final', t0).then((f) => {
      report.screenshots.push({ atMs: Date.now() - t0, label: 'final', file: f, ui: report.final })
    })

    const expKey = options.seedE2E ? 'e2e' : 'fresh'
    const exp = EXPECT[expKey]
    const reached = report.timeline.map((t) => t.phase)
    const hitAccept = exp.acceptPhases.some((p) => reached.includes(p))
    const hitReject = exp.rejectPhases.some((p) => reached.includes(p))
    const shellMs = report.timeline.find((t) => t.phase === 'shell-visible')?.atMs
    const pickerMs = report.timeline.find((t) => t.phase === 'workspace-picker')?.atMs
    const bootSplashMs = report.timeline.find((t) => t.phase === 'boot-splash-visible')?.atMs
    const reactSplashMs = report.timeline.find((t) => t.phase === 'react-splash-visible')?.atMs
    const firstVisibleMs = bootSplashMs ?? reactSplashMs ?? pickerMs ?? shellMs

    report.metrics = {
      firstSplashMs: bootSplashMs ?? reactSplashMs ?? null,
      workspacePickerMs: pickerMs ?? null,
      shellMs: shellMs ?? null,
      totalMs: Date.now() - t0,
    }

    report.comparison = {
      expected: exp.description,
      actual: {
        phases: reached,
        metrics: report.metrics,
        final: report.final,
      },
      verdict: [],
    }

    if (hitReject) report.comparison.verdict.push('FAIL: 出现错误页/异常边界')
    if (!hitAccept) report.comparison.verdict.push('FAIL: 未达到预期交互阶段')
    if (exp.maxMsToFirstSplash && firstVisibleMs != null && firstVisibleMs > exp.maxMsToFirstSplash) {
      report.comparison.verdict.push(
        `FAIL: 首屏动画 ${firstVisibleMs}ms > 预算 ${exp.maxMsToFirstSplash}ms`,
      )
    }
    if (options.seedE2E && shellMs != null && shellMs > EXPECT.e2e.maxMsToShell) {
      report.comparison.verdict.push(`FAIL: 主界面 ${shellMs}ms > 预算 ${EXPECT.e2e.maxMsToShell}ms`)
    }
    if (!options.seedE2E) {
      if (firstVisibleMs == null) {
        report.comparison.verdict.push(`FAIL: ${exp.maxMsToInteractive / 1000}s 内无任何可见 UI（可能黑屏）`)
      } else if (shellMs != null && shellMs > EXPECT.fresh.maxMsToInteractive) {
        report.comparison.verdict.push(
          `FAIL: 主界面 ${shellMs}ms > 预算 ${EXPECT.fresh.maxMsToInteractive}ms`,
        )
      } else if (pickerMs != null && pickerMs > EXPECT.fresh.maxMsToInteractive) {
        report.comparison.verdict.push(
          `FAIL: 工作区选择 ${pickerMs}ms > 预算 ${EXPECT.fresh.maxMsToInteractive}ms`,
        )
      }
    }
    if (report.pageErrors.length) report.comparison.verdict.push(`WARN: ${report.pageErrors.length} 个 pageerror`)
    if (report.comparison.verdict.length === 0) report.comparison.verdict.push('PASS')

    report.pass = report.comparison.verdict.every((v) => v === 'PASS' || v.startsWith('WARN'))

    const outJson = path.join(auditRoot, 'report.json')
    fs.writeFileSync(outJson, JSON.stringify(report, null, 2))

    console.log(`[audit:${name}] metrics:`, report.metrics)
    console.log(`[audit:${name}] verdict:`, report.comparison.verdict.join('; '))
    console.log(`[audit:${name}] screenshots:`, auditRoot)
    console.log(`[audit:${name}] report:`, outJson)

    return report
  } finally {
    try {
      if (app) await app.close()
    } catch {
      /* ignore */
    }
  }
}

if (!fs.existsSync(EXE)) {
  console.error('[audit] Missing exe:', EXE)
  process.exit(1)
}

console.log('[audit] EXE:', EXE)
const results = []

try {
  results.push(await runScenario('fresh-user', { seedE2E: false }))
  results.push(await runScenario('e2e-user', { seedE2E: true, workspace: E2E_WORKSPACE }))
} catch (err) {
  console.error('[audit] CRASH:', err)
  process.exit(1)
}

const summaryPath = path.join(ROOT, 'startup-audit-summary.json')
fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2))

console.log('\n=== STARTUP AUDIT SUMMARY ===')
for (const r of results) {
  const status = r.pass ? 'PASS' : 'FAIL'
  console.log(`${status}  ${r.scenario}  total=${r.metrics?.totalMs}ms  ${r.comparison.verdict.join('; ')}`)
  console.log(`       shots: ${r.auditRoot}`)
}
console.log('Summary:', summaryPath)

const allPass = results.every((r) => r.pass)
process.exit(allPass ? 0 : 1)
