#!/usr/bin/env node
/**
 * Visual cold-start + focus-thaw acceptance for portable-green.
 * - Screenshots at 0.5s / 2s / 5s / 15s after first window
 * - Wait HOLD_MS (default 3 min) in background, then focus + click probe
 * - Fail if early frames are near-white empty (no brand/splash/shell)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE =
  process.env.METAMATES_PACKAGED_EXE?.trim() ||
  path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const HOLD_MS = Number(process.env.METAMATES_VISUAL_HOLD_MS || 180_000)
const OUT_DIR = path.join(ROOT, 'tmp-visual-startup')

if (!fs.existsSync(EXE)) {
  console.error('[visual] Missing exe:', EXE)
  process.exit(1)
}

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-visual-'))
const userDataDir = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(userDataDir, { recursive: true })

const report = { exe: EXE, holdMs: HOLD_MS, shots: [], errors: [], verdicts: [] }

function mark(msg) {
  const line = `+${Date.now() - t0}ms ${msg}`
  console.log(`[visual] ${line}`)
  report.verdicts.push(line)
}

/** @param {Buffer} png */
function isNearWhiteEmpty(png) {
  // Sample a few bytes — Playwright PNG; crude luminance of center crop via raw is hard.
  // Use size + later DOM checks; here only guard tiny/empty captures.
  return !png || png.length < 8_000
}

const t0 = Date.now()
let app

try {
  mark(`launch ${EXE}`)
  app = await electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${userDataDir}`],
    timeout: 120_000,
    env: {
      ...process.env,
      METAMATES_E2E: '1',
    },
  })

  const page = await app.firstWindow({ timeout: 120_000 })
  page.on('pageerror', (err) => report.errors.push(String(err)))
  mark('first-window')

  const shotAt = async (label, waitMs) => {
    if (waitMs > 0) await page.waitForTimeout(waitMs)
    const file = path.join(OUT_DIR, `${String(report.shots.length).padStart(2, '0')}-${label}.png`)
    const buf = await page.screenshot({ path: file, type: 'png' })
    const boot = await page.locator('#boot-splash').isVisible().catch(() => false)
    const react = await page.locator('[data-testid="startup-splash"]').isVisible().catch(() => false)
    const shell = await page.locator('.status-bar').isVisible().catch(() => false)
    const entry = {
      label,
      file,
      bytes: buf.length,
      boot,
      react,
      shell,
      nearEmpty: isNearWhiteEmpty(buf),
      atMs: Date.now() - t0,
    }
    report.shots.push(entry)
    mark(`shot ${label} boot=${boot} react=${react} shell=${shell} bytes=${buf.length}`)
    return entry
  }

  await shotAt('t0', 0)
  await shotAt('t500ms', 500)
  await shotAt('t2s', 1_500)
  await shotAt('t5s', 3_000)
  await shotAt('t15s', 10_000)

  // Early frames must show boot or react splash (not empty white).
  const early = report.shots.filter((s) => ['t0', 't500ms', 't2s'].includes(s.label))
  const earlyHasBrand = early.some((s) => s.boot || s.react || s.shell)
  if (!earlyHasBrand) {
    report.errors.push('No boot/react/shell in first 2s — white/empty cold start still present')
  }

  mark(`hold background ${HOLD_MS}ms (simulate leave for a few minutes)`)
  // Blur by opening a tiny second window then focusing away isn't easy in Electron;
  // minimize + restore approximates Alt-Tab away / back after a long wait.
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.isDestroyed()) w.minimize()
  })
  await page.waitForTimeout(HOLD_MS)
  mark('restore after hold')
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w || w.isDestroyed()) return
    w.restore()
    w.show()
    w.focus()
  })

  const clickStart = Date.now()
  // Click center of window — should not take many seconds if renderer stayed warm.
  await page.mouse.click(400, 300)
  await page.waitForTimeout(200)
  const clickLatency = Date.now() - clickStart
  report.clickLatencyMs = clickLatency
  mark(`post-restore click latency ${clickLatency}ms`)
  await shotAt('after-hold-focus', 300)

  if (clickLatency > 3_000) {
    report.errors.push(`Click after long background felt frozen (${clickLatency}ms > 3000)`)
  }

  const shellOk =
    report.shots.some((s) => s.shell) ||
    (await page.locator('.status-bar, [data-testid="welcome-wizard"], .ant-modal').first().isVisible().catch(() => false))
  if (!shellOk) report.errors.push('Shell/wizard never became visible')

  const outJson = path.join(OUT_DIR, 'report.json')
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2))
  mark(`report ${outJson}`)

  if (report.errors.length) {
    console.error('[visual] FAIL', report.errors)
    process.exit(1)
  }
  console.log('[visual] PASS')
} catch (err) {
  console.error('[visual] CRASH', err)
  process.exit(1)
} finally {
  try {
    if (app) await app.close()
  } catch {
    /* ignore */
  }
}
