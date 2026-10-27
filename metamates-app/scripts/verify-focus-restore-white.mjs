#!/usr/bin/env node
/**
 * Foreground restore white-flash guard (user path: Alt-Tab back to MetaMates).
 *
 * Why earlier "PASS" was dishonest:
 * - Tests looked at STARTUP / minimize thaw / late capturePage
 * - capturePage never returns the intermediate compositor clear — it returns
 *   the next fully painted frame. Light users still SEE cream backgroundColor
 *   (#F0EEEA) for 1–N frames when webContents.invalidate() wiped the surface.
 *
 * This script:
 * 1) Asserts packaged main no longer calls webContents.invalidate on focus/restore
 * 2) Still runs an in-main focus-restore burst (regression if UI goes empty)
 *
 * Exit: 0 pass · 2 fail · 1 crash
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE =
  process.env.METAMATES_PACKAGED_EXE?.trim() ||
  path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const OUT = path.join(ROOT, 'tmp-focus-restore-white')
const HOLD_MS = Number(process.env.METAMATES_FOCUS_HOLD_MS || 10_000)
const BURST_MS = Number(process.env.METAMATES_FOCUS_BURST_MS || 3_000)
const PALE_AVG = Number(process.env.METAMATES_FOCUS_PALE_AVG || 0.88)
const PALE_RANGE = Number(process.env.METAMATES_FOCUS_PALE_RANGE || 0.4)
const PRESET = (process.env.METAMATES_THEME_PRESET || 'system').toLowerCase()

if (!fs.existsSync(EXE)) {
  console.error('[focus-white] Missing exe:', EXE)
  process.exit(1)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-focus-white-'))
const userDataDir = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(userDataDir, { recursive: true })

const SEED = {
  theme: PRESET === 'light' || PRESET === 'dark' || PRESET === 'system' ? PRESET : 'system',
  lightPalette: 'paper',
  fontSize: 14,
  language: 'zh',
  autoSave: true,
  engineSetupStatus: 'ready',
}
fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(SEED, null, 2))
const STORAGE = JSON.stringify({ settings: { ...SEED }, version: '1.0.0' })

function osLight() {
  if (process.platform !== 'win32') return null
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
      { encoding: 'utf8' },
    )
    const m = out.match(/AppsUseLightTheme\s+REG_DWORD\s+0x(\d+)/i)
    return m ? parseInt(m[1], 16) === 1 : null
  } catch {
    return null
  }
}

const report = {
  exe: EXE,
  userDataDir,
  preset: SEED.theme,
  osAppsUseLightTheme: osLight(),
  holdMs: HOLD_MS,
  burstMs: BURST_MS,
  paleRule: `avgLum>=${PALE_AVG} && lumRange<=${PALE_RANGE}`,
  method:
    'in-main capturePage burst during focus restore (second BrowserWindow thief; not minimize)',
  preHold: null,
  burst: null,
  paleFrames: [],
  errors: [],
  verdict: null,
}

const t0 = Date.now()
const log = (m) => console.log(`[focus-white +${Date.now() - t0}ms] ${m}`)

/** Static guard: patched main must not wipe compositor to backgroundColor on focus. */
function assertNoInvalidateOnFocusRestore() {
  const asar = path.join(path.dirname(EXE), 'resources', 'app.asar')
  const mainCandidates = [
    path.join(ROOT, 'dist-electron', 'main.cjs'),
    path.join(ROOT, 'electron', 'main.ts'),
  ]
  const needles = []
  for (const p of mainCandidates) {
    if (fs.existsSync(p)) needles.push({ path: p, text: fs.readFileSync(p, 'utf8') })
  }
  // Unpack asar main if present (best-effort via npx asar is slow — read dist-electron which patch copies).
  if (!needles.length) {
    report.errors.push('Cannot locate main.cjs/main.ts to assert no invalidate()')
    return
  }
  for (const { path: p, text } of needles) {
    const focusBlock =
      text.includes('softRepaintAfterFocus') ||
      text.includes("translateZ(0)")
    const stillHardInvalidate =
      /mainWindow\.on\('(?:focus|restore|show)'[\s\S]{0,800}?webContents\.invalidate\(/.test(text) ||
      /repaintOnRestoreOrShow[\s\S]{0,400}?invalidate\(/.test(text)
    if (stillHardInvalidate) {
      report.errors.push(
        `${path.basename(p)}: focus/restore still calls webContents.invalidate() — cream bg=#F0EEEA becomes 白屏`,
      )
    } else if (!focusBlock && p.endsWith('main.cjs')) {
      report.errors.push(`${path.basename(p)}: missing softRepaintAfterFocus (focus restore path regresssed)`)
    } else {
      log(`static OK ${path.basename(p)} soft-repaint, no focus invalidate`)
    }
  }
  void asar
}

async function launchApp() {
  return electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${userDataDir}`],
    timeout: 120_000,
    env: { ...process.env, METAMATES_E2E: '1' },
  })
}

let app
try {
  log(`preset=${SEED.theme} osLight=${report.osAppsUseLightTheme} hold=${HOLD_MS}ms burst=${BURST_MS}ms`)
  assertNoInvalidateOnFocusRestore()
  log('pass1 seed')
  app = await launchApp()
  const p1 = await app.firstWindow({ timeout: 120_000 })
  await p1.waitForTimeout(2_500)
  await p1.evaluate((raw) => localStorage.setItem('metamates-storage', raw), STORAGE)
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(SEED, null, 2))
  await app.close()
  app = null
  await new Promise((r) => setTimeout(r, 800))

  log('pass2 wait shell')
  app = await launchApp()
  const page = await app.firstWindow({ timeout: 120_000 })
  await page.waitForSelector('.status-bar', { timeout: 90_000 })
  await page.waitForTimeout(1_200)
  log('shell ready — pre-hold snapshot')

  const pre = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed() && x.getTitle() !== 'focus-thief')
    if (!w) return null
    const img = await w.capturePage()
    return {
      bg: typeof w.getBackgroundColor === 'function' ? w.getBackgroundColor() : null,
      pngB64: Buffer.from(img.toPNG()).toString('base64'),
      bitmapB64: Buffer.from(img.toBitmap()).toString('base64'),
      w: img.getSize().width,
      h: img.getSize().height,
    }
  })
  if (pre?.bitmapB64) {
    const bmp = Buffer.from(pre.bitmapB64, 'base64')
    const pixels = (bmp.length / 4) | 0
    let sum = 0
    let n = 0
    let min = 1
    let max = 0
    const step = pixels > 80_000 ? 8 : 4
    for (let p = 0; p < pixels; p += step) {
      const o = p * 4
      const lum = (0.2126 * bmp[o + 2] + 0.7152 * bmp[o + 1] + 0.0722 * bmp[o]) / 255
      sum += lum
      n += 1
      if (lum < min) min = lum
      if (lum > max) max = lum
    }
    const avgLum = sum / n
    const lumRange = max - min
    const file = path.join(OUT, `00-pre-hold-lum${avgLum.toFixed(3)}.png`)
    fs.writeFileSync(file, Buffer.from(pre.pngB64, 'base64'))
    report.preHold = { avgLum, lumRange, pale: avgLum >= PALE_AVG && lumRange <= PALE_RANGE, file, bg: pre.bg }
    log(`pre-hold lum=${avgLum.toFixed(3)} range=${lumRange.toFixed(3)} bg=${pre.bg}`)
  }

  log(`steal focus + hold ${HOLD_MS}ms + in-main burst`)
  const burstResult = await app.evaluate(
    async ({ BrowserWindow }, opts) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const main = BrowserWindow.getAllWindows().find(
        (x) => x && !x.isDestroyed() && x.getTitle() !== 'focus-thief',
      )
      if (!main) return { error: 'no-main' }

      const thief = new BrowserWindow({
        width: 520,
        height: 360,
        title: 'focus-thief',
        show: true,
        backgroundColor: '#111111',
        webPreferences: { contextIsolation: true },
      })
      await thief.loadURL(
        'data:text/html,<body style="margin:0;background:#111;color:#eee;font:18px sans-serif;display:flex;height:100vh;align-items:center;justify-content:center">focus thief</body>',
      )
      thief.show()
      thief.moveTop()
      thief.focus()
      main.blur()

      await sleep(opts.holdMs)

      const frames = []
      const palePngs = []
      const earlyPngs = []
      const t0 = Date.now()
      let i = 0
      let focusKicked = false

      const lumStats = (bitmap) => {
        const pixels = (bitmap.length / 4) | 0
        if (pixels <= 0) return { avgLum: 0, lumRange: 0, pale: false }
        let sum = 0
        let n = 0
        let min = 1
        let max = 0
        const step = pixels > 80_000 ? 8 : pixels > 20_000 ? 4 : 1
        for (let p = 0; p < pixels; p += step) {
          const o = p * 4
          const lum = (0.2126 * bitmap[o + 2] + 0.7152 * bitmap[o + 1] + 0.0722 * bitmap[o]) / 255
          sum += lum
          n += 1
          if (lum < min) min = lum
          if (lum > max) max = lum
        }
        const avgLum = sum / n
        const lumRange = max - min
        return {
          avgLum,
          lumRange,
          pale: avgLum >= opts.paleAvg && lumRange <= opts.paleRange,
        }
      }

      // Start bursting BEFORE focus so we catch the first compositor frames.
      while (Date.now() - t0 < opts.burstMs) {
        if (!focusKicked && Date.now() - t0 >= 40) {
          focusKicked = true
          try {
            thief.blur()
            thief.hide()
          } catch {
            /* ignore */
          }
          if (main.isMinimized()) main.restore()
          main.show()
          main.focus()
          main.moveTop()
        }

        const atMs = Date.now() - t0
        try {
          const img = await Promise.race([
            main.capturePage(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('cap-timeout')), 800)),
          ])
          const bitmap = Buffer.from(img.toBitmap())
          const stats = lumStats(bitmap)
          const entry = {
            i,
            atMs,
            ...stats,
            focused: main.isFocused(),
            visible: main.isVisible(),
            size: img.getSize(),
            bg: typeof main.getBackgroundColor === 'function' ? main.getBackgroundColor() : null,
          }
          frames.push(entry)
          if (stats.pale) {
            palePngs.push({ i, atMs, pngB64: Buffer.from(img.toPNG()).toString('base64'), ...stats })
          } else if (earlyPngs.length < 8) {
            earlyPngs.push({ i, atMs, pngB64: Buffer.from(img.toPNG()).toString('base64'), ...stats })
          }
        } catch (err) {
          frames.push({ i, atMs, error: String(err), pale: false })
        }
        i += 1
      }

      try {
        if (!thief.isDestroyed()) thief.destroy()
      } catch {
        /* ignore */
      }

      return {
        sampleCount: frames.length,
        paleCount: frames.filter((f) => f.pale).length,
        frames,
        palePngs,
        earlyPngs,
        focusKicked,
        windowBg: typeof main.getBackgroundColor === 'function' ? main.getBackgroundColor() : null,
      }
    },
    { holdMs: HOLD_MS, burstMs: BURST_MS, paleAvg: PALE_AVG, paleRange: PALE_RANGE },
  )

  report.burst = {
    sampleCount: burstResult.sampleCount,
    paleCount: burstResult.paleCount,
    focusKicked: burstResult.focusKicked,
    windowBg: burstResult.windowBg,
    frames: burstResult.frames,
  }
  report.paleFrames = (burstResult.frames || []).filter((f) => f.pale)

  for (const p of burstResult.palePngs || []) {
    const file = path.join(OUT, `PALE-${String(p.i).padStart(3, '0')}-t${p.atMs}ms-lum${p.avgLum.toFixed(3)}.png`)
    fs.writeFileSync(file, Buffer.from(p.pngB64, 'base64'))
    p.file = file
  }
  for (const p of burstResult.earlyPngs || []) {
    const file = path.join(OUT, `early-${String(p.i).padStart(3, '0')}-t${p.atMs}ms-lum${p.avgLum.toFixed(3)}.png`)
    fs.writeFileSync(file, Buffer.from(p.pngB64, 'base64'))
  }

  log(
    `burst samples=${burstResult.sampleCount} pale=${burstResult.paleCount} bg=${burstResult.windowBg}`,
  )
  for (const f of (burstResult.frames || []).slice(0, 20)) {
    log(
      `  #${f.i} t=${f.atMs}ms lum=${f.avgLum?.toFixed(3) ?? f.error} range=${f.lumRange?.toFixed(3) ?? ''} pale=${f.pale} focused=${f.focused}`,
    )
  }

  if (burstResult.paleCount > 0) {
    report.errors.push(
      `Foreground restore pale flash: ${burstResult.paleCount}/${burstResult.sampleCount} frames (avgLum>=${PALE_AVG} && range<=${PALE_RANGE})`,
    )
  }
  if (!burstResult.sampleCount) report.errors.push('Zero burst samples')

  report.verdict = {
    pass: report.errors.length === 0,
    note:
      report.errors.length === 0
        ? `PASS — ${burstResult.sampleCount} in-main frames, no pale flash`
        : `REPRO — ${report.errors.join('; ')}`,
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(
    path.join(OUT, 'EVIDENCE.md'),
    [
      '# Focus restore white-flash',
      '',
      `- method: ${report.method}`,
      `- preset=${SEED.theme} osLight=${report.osAppsUseLightTheme}`,
      `- hold=${HOLD_MS}ms burst=${BURST_MS}ms`,
      `- pale: ${report.paleRule}`,
      `- samples=${burstResult.sampleCount} pale=${burstResult.paleCount}`,
      `- windowBg=${burstResult.windowBg}`,
      `- verdict: ${report.verdict.note}`,
      '',
      '| # | atMs | avgLum | range | pale | focused |',
      '|---|------|--------|-------|------|---------|',
      ...(burstResult.frames || [])
        .filter((f, idx) => f.pale || idx < 25 || idx % 15 === 0)
        .map(
          (f) =>
            `| ${f.i} | ${f.atMs} | ${f.avgLum?.toFixed(3) ?? f.error} | ${f.lumRange?.toFixed(3) ?? ''} | ${f.pale} | ${f.focused} |`,
        ),
    ].join('\n'),
  )

  log(report.verdict.note)
  if (!report.verdict.pass) {
    console.error('[focus-white] FAIL', report.errors)
    process.exit(2)
  }
  console.log('[focus-white] PASS')
  process.exit(0)
} catch (err) {
  console.error('[focus-white] CRASH', err)
  try {
    fs.writeFileSync(path.join(OUT, 'crash.json'), JSON.stringify({ error: String(err), stack: err?.stack }, null, 2))
  } catch {
    /* ignore */
  }
  process.exit(1)
} finally {
  try {
    if (app) await app.close()
  } catch {
    /* ignore */
  }
}
