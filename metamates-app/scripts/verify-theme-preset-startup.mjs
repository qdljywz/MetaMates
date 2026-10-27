#!/usr/bin/env node
/**
 * Real-user theme preset cold start (not a toy light-only seed).
 *
 * Default profile matches production report:
 *   settings.theme = "system"  +  Windows AppsUseLightTheme
 * Failure mode: main locked nativeTheme=dark → theme-boot matchMedia dark →
 * black splash → unlock → cream shell (black flash).
 *
 * Override: METAMATES_THEME_PRESET=light|dark|system
 *
 * Exit: 0 pass · 2 reproduced black splash/flash · 1 crash / skipped
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
const OUT = path.join(ROOT, 'tmp-theme-preset-startup')
const PRESET = (process.env.METAMATES_THEME_PRESET || 'system').toLowerCase()
const DARK_MAX = Number(process.env.METAMATES_DARK_MAX || 0.42)
const SPLASH_MIN = Number(process.env.METAMATES_SPLASH_MIN || 0.72)
const MARKS_MS = [0, 150, 400, 800, 1500, 2500, 4000, 5500, 6500, 8000]

if (!fs.existsSync(EXE)) {
  console.error('[theme-preset] Missing exe:', EXE)
  process.exit(1)
}

function readWindowsAppsUseLightTheme() {
  if (process.platform !== 'win32') return null
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
      { encoding: 'utf8' },
    )
    const m = out.match(/AppsUseLightTheme\s+REG_DWORD\s+0x(\d+)/i)
    if (!m) return null
    return parseInt(m[1], 16) === 1
  } catch {
    return null
  }
}

const osLight = readWindowsAppsUseLightTheme()
/** Expected splash appearance for this machine + preset. */
function expectedAppearance() {
  if (PRESET === 'light') return 'light'
  if (PRESET === 'dark') return 'dark'
  // system
  if (osLight === true) return 'light'
  if (osLight === false) return 'dark'
  return null
}

const expectAppearance = expectedAppearance()
if (PRESET === 'system' && expectAppearance == null) {
  console.error('[theme-preset] Cannot read OS AppsUseLightTheme — refuse to fake a pass')
  process.exit(1)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-theme-preset-'))
const userDataDir = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(userDataDir, { recursive: true })

// Mirror real AppData shape: theme=system is the reported production case.
const SEED_SETTINGS = {
  theme: PRESET === 'light' || PRESET === 'dark' || PRESET === 'system' ? PRESET : 'system',
  lightPalette: 'paper',
  fontSize: 14,
  language: 'zh',
  autoSave: true,
  engineSetupStatus: 'ready',
}
fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(SEED_SETTINGS, null, 2))

const SEED_STORAGE = JSON.stringify({
  settings: { ...SEED_SETTINGS },
  version: '1.0.0',
})

const report = {
  exe: EXE,
  userDataDir,
  preset: SEED_SETTINGS.theme,
  osAppsUseLightTheme: osLight,
  expectAppearance,
  thresholds: { DARK_MAX, SPLASH_MIN, MARKS_MS },
  timedFrames: [],
  darkFrames: [],
  dimSplashFrames: [],
  errors: [],
  verdict: null,
}

const t0 = Date.now()
const log = (m) => console.log(`[theme-preset +${Date.now() - t0}ms] ${m}`)
log(
  `preset=${SEED_SETTINGS.theme} osLight=${osLight} expectAppearance=${expectAppearance} (real-user path)`,
)

function lumOfBitmap(bitmap) {
  const pixels = (bitmap.length / 4) | 0
  if (pixels <= 0) return { avgLum: 0, lumRange: 0, empty: true }
  let sum = 0
  let n = 0
  let min = Infinity
  let max = -Infinity
  const step = pixels > 80_000 ? 8 : pixels > 20_000 ? 4 : 1
  for (let p = 0; p < pixels; p += step) {
    const off = p * 4
    const b = bitmap[off]
    const g = bitmap[off + 1]
    const r = bitmap[off + 2]
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    sum += lum
    n += 1
    if (lum < min) min = lum
    if (lum > max) max = lum
  }
  return { avgLum: sum / n, lumRange: max - min, empty: false }
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
  log('pass1 seed localStorage to match settings.json')
  app = await launchApp()
  const p1 = await app.firstWindow({ timeout: 120_000 })
  await p1.waitForTimeout(2_500)
  await p1.evaluate((raw) => localStorage.setItem('metamates-storage', raw), SEED_STORAGE)
  const settingsPath = path.join(userDataDir, 'settings.json')
  fs.writeFileSync(settingsPath, JSON.stringify(SEED_SETTINGS, null, 2))
  await app.close()
  app = null
  await new Promise((r) => setTimeout(r, 800))

  log('pass2 cold start timed captures')
  app = await launchApp()

  const waitWinStart = Date.now()
  while (Date.now() - waitWinStart < 30_000) {
    const has = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w && !w.isDestroyed()),
    )
    if (has) break
    await new Promise((r) => setTimeout(r, 20))
  }
  const coldStart = Date.now()
  log('BrowserWindow exists — clock zero')

  for (const mark of MARKS_MS) {
    const wait = mark - (Date.now() - coldStart)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    const atMs = Date.now() - coldStart

    const shot = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed())
      if (!w) return { error: 'no-window' }
      try {
        const img = await Promise.race([
          w.capturePage(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('capture-timeout-2s')), 2000)),
        ])
        const size = img.getSize()
        const bitmap = Buffer.from(img.toBitmap())
        return {
          visible: w.isVisible(),
          width: size.width,
          height: size.height,
          bg: typeof w.getBackgroundColor === 'function' ? w.getBackgroundColor() : null,
          pngB64: Buffer.from(img.toPNG()).toString('base64'),
          bitmapB64: bitmap.toString('base64'),
        }
      } catch (err) {
        return { error: String(err), visible: w.isVisible() }
      }
    })

    let stats = { avgLum: null, lumRange: null }
    let file = null
    if (shot.bitmapB64) {
      stats = lumOfBitmap(Buffer.from(shot.bitmapB64, 'base64'))
      const tag = stats.avgLum != null && stats.avgLum < DARK_MAX ? 'DARK' : 'ok'
      const name = `t${String(mark).padStart(4, '0')}ms-wall${atMs}ms-lum${stats.avgLum?.toFixed(3) ?? 'na'}-${tag}.png`
      file = path.join(OUT, name)
      if (shot.pngB64) fs.writeFileSync(file, Buffer.from(shot.pngB64, 'base64'))
    }

    let dom = null
    try {
      const page = await app.firstWindow({ timeout: 5_000 })
      dom = await page.evaluate(() => ({
        boot: document.documentElement.getAttribute('data-boot'),
        theme: document.documentElement.getAttribute('data-theme'),
        palette: document.documentElement.getAttribute('data-light-palette'),
        htmlSplash: !!document.getElementById('boot-splash'),
        reactSplash: !!document.querySelector('[data-testid="startup-splash"]'),
        shell: !!document.querySelector('.status-bar'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      }))
    } catch {
      /* CDP may lag */
    }

    const isSplash = !!(dom?.htmlSplash || dom?.reactSplash)
    const dark = stats.avgLum != null && stats.avgLum < DARK_MAX
    const dimSplash =
      expectAppearance === 'light' && isSplash && stats.avgLum != null && stats.avgLum < SPLASH_MIN

    const entry = {
      markMs: mark,
      atMs,
      file,
      ...stats,
      dark,
      dimSplash,
      windowBg: shot.bg || null,
      visible: shot.visible,
      error: shot.error || null,
      dom,
    }
    report.timedFrames.push(entry)
    if (expectAppearance === 'light' && dark) report.darkFrames.push(entry)
    if (dimSplash) report.dimSplashFrames.push(entry)
    log(
      `mark ${mark}ms wall=${atMs}ms lum=${stats.avgLum?.toFixed(3) ?? 'na'} dark=${dark} theme=${dom?.theme} prefersDark=${dom?.prefersDark} splash=${dom?.htmlSplash}/${dom?.reactSplash} shell=${dom?.shell}`,
    )
  }

  const page = await app.firstWindow({ timeout: 30_000 })
  await page.waitForTimeout(500)
  const finalDom = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    boot: document.documentElement.hasAttribute('data-boot'),
    shell: !!document.querySelector('.status-bar'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  }))
  report.finalDom = finalDom

  if (expectAppearance === 'light') {
    if (finalDom.theme !== 'light') {
      report.errors.push(`Final theme is ${finalDom.theme}, expected light (system+light OS)`)
    }
    const splashSeen = report.timedFrames.some(
      (f) => (f.dom?.htmlSplash || f.dom?.reactSplash) && f.avgLum != null && f.avgLum >= SPLASH_MIN,
    )
    if (!splashSeen) {
      report.errors.push(
        `No cream splash (avgLum>=${SPLASH_MIN}) under theme=${SEED_SETTINGS.theme} — still black boot`,
      )
    }
    if (report.darkFrames.length) {
      report.errors.push(
        `Black flash/splash: ${report.darkFrames.length} frame(s) avgLum<${DARK_MAX}`,
      )
    }
    if (report.dimSplashFrames.length) {
      report.errors.push(
        `Dim splash: ${report.dimSplashFrames.length} splash frame(s) avgLum<${SPLASH_MIN}`,
      )
    }
    // Early prefers-color-scheme must not be dark (that was the nativeTheme lock bug).
    const early = report.timedFrames.find((f) => f.dom?.prefersDark != null)
    if (early?.dom?.prefersDark === true) {
      report.errors.push(
        'prefers-color-scheme:dark during boot while OS is light — nativeTheme still force-locked dark',
      )
    }
  } else if (expectAppearance === 'dark') {
    const splashDark = report.timedFrames.some(
      (f) => (f.dom?.htmlSplash || f.dom?.reactSplash) && f.avgLum != null && f.avgLum < 0.35,
    )
    if (!splashDark && report.timedFrames.some((f) => f.dom?.htmlSplash || f.dom?.reactSplash)) {
      report.errors.push('Expected dark splash under dark appearance, got bright frames')
    }
    if (finalDom.theme !== 'dark') {
      report.errors.push(`Final theme is ${finalDom.theme}, expected dark`)
    }
  }

  report.verdict = {
    pass: report.errors.length === 0,
    note:
      report.errors.length === 0
        ? `PASS — preset=${SEED_SETTINGS.theme} appearance=${expectAppearance} continuous`
        : `FAIL — ${report.errors.join('; ')}`,
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  const md = [
    '# Theme preset startup (real-user path)',
    '',
    `- preset: ${SEED_SETTINGS.theme}`,
    `- OS AppsUseLightTheme: ${osLight}`,
    `- expectAppearance: ${expectAppearance}`,
    `- verdict: ${report.verdict.note}`,
    '',
    '| markMs | wallMs | avgLum | dark | theme | prefersDark | html/react | shell | bodyBg |',
    '|--------|--------|--------|------|-------|-------------|------------|-------|--------|',
    ...report.timedFrames.map((f) => {
      const d = f.dom || {}
      return `| ${f.markMs} | ${f.atMs} | ${f.avgLum?.toFixed(3) ?? f.error} | ${f.dark} | ${d.theme} | ${d.prefersDark} | ${d.htmlSplash}/${d.reactSplash} | ${d.shell} | ${d.bodyBg || ''} |`
    }),
    '',
    `final: ${JSON.stringify(finalDom)}`,
  ].join('\n')
  fs.writeFileSync(path.join(OUT, 'report.md'), md)

  log(report.verdict.note)
  if (!report.verdict.pass) {
    console.error('[theme-preset] FAIL', report.errors)
    process.exit(2)
  }
  console.log('[theme-preset] PASS')
  process.exit(0)
} catch (err) {
  console.error('[theme-preset] CRASH', err)
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
