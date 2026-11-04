#!/usr/bin/env node
/**
 * Honest startup + freeze evidence for portable-green.
 *
 * Fixes prior capture lies:
 * - Do NOT label post-burst screenshots as t=0
 * - Full-window luminance (not 64×64 center of dark logo)
 * - Timed full PNGs at real wall-clock marks through splash handoff (0–8s)
 * - Treat paper-cream (#f0eeea ~0.93) as "pale flash" (user-reported 白屏)
 * - Focus-thaw: minimize → hold → restore → measure first-click latency (假死)
 *
 * Exit: 0 = no pale flash + thaw OK; 2 = reproduced pale/freeze; 1 = crash
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
const OUT = path.join(ROOT, 'tmp-startup-truth')
const HOLD_MS = Number(process.env.METAMATES_THAW_HOLD_MS || 45_000)
/** Paper cream / near-white empty shell (even with UI chrome contrast). */
const PALE_AVG = Number(process.env.METAMATES_PALE_AVG || 0.78)
const PALE_RANGE = Number(process.env.METAMATES_PALE_RANGE || 0.35)
/** Dominant cream/white regardless of contrast — matches user-reported 白屏. */
const CREAM_FLASH_AVG = Number(process.env.METAMATES_CREAM_AVG || 0.9)
const MARKS_MS = [0, 200, 500, 1000, 2000, 3500, 5000, 5500, 6000, 6500, 7000, 8000]

if (!fs.existsSync(EXE)) {
  console.error('[truth] Missing exe:', EXE)
  process.exit(1)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-truth-'))
const userDataDir = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(userDataDir, { recursive: true })
fs.writeFileSync(
  path.join(userDataDir, 'settings.json'),
  JSON.stringify(
    {
      theme: 'light',
      lightPalette: 'paper',
      fontSize: 14,
      language: 'zh',
      autoSave: true,
      engineSetupStatus: 'ready',
    },
    null,
    2,
  ),
)

const LIGHT_STORAGE = JSON.stringify({
  settings: {
    theme: 'light',
    lightPalette: 'paper',
    fontSize: 14,
    language: 'zh',
    autoSave: true,
  },
  version: '1.0.0',
})

const report = {
  exe: EXE,
  userDataDir,
  method: {
    fullWindow: true,
    timedFullPngs: MARKS_MS,
    paleRule: `avgLum>=${PALE_AVG} && lumRange<=${PALE_RANGE}`,
    thawHoldMs: HOLD_MS,
    note: 'Full PNGs captured AT the mark, not post-labeled',
  },
  timedFrames: [],
  paleFrames: [],
  thaw: null,
  errors: [],
  verdict: null,
}

const t0 = Date.now()
const log = (m) => console.log(`[truth +${Date.now() - t0}ms] ${m}`)

function lumOfBitmap(bitmap) {
  const pixels = (bitmap.length / 4) | 0
  if (pixels <= 0) return { avgLum: 0, lumRange: 0, pale: false, empty: true }
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
  const avgLum = sum / n
  const lumRange = max - min
  return {
    avgLum,
    lumRange,
    pale: (avgLum >= PALE_AVG && lumRange <= PALE_RANGE) || avgLum >= CREAM_FLASH_AVG,
    empty: false,
  }
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
  log('pass1 seed light theme')
  app = await launchApp()
  const p1 = await app.firstWindow({ timeout: 120_000 })
  await p1.waitForTimeout(2_500)
  await p1.evaluate((raw) => localStorage.setItem('metamates-storage', raw), LIGHT_STORAGE)
  await app.close()
  app = null
  await new Promise((r) => setTimeout(r, 800))

  log('pass2 cold start — timed FULL-WINDOW captures at real marks')
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
  log('BrowserWindow exists — clock zero for marks')

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
          bounds: w.getBounds(),
          pngB64: Buffer.from(img.toPNG()).toString('base64'),
          bitmapB64: bitmap.toString('base64'),
          bitmapLen: bitmap.length,
        }
      } catch (err) {
        return { error: String(err), visible: w.isVisible() }
      }
    })

    let stats = { avgLum: null, lumRange: null, pale: false }
    let file = null
    if (shot.pngB64) {
      const tag = shot.error ? 'ERR' : stats.pale ? 'PALE' : 'ok'
      // lum first then name
      const bmp = Buffer.from(shot.bitmapB64, 'base64')
      stats = lumOfBitmap(bmp)
      const name = `t${String(mark).padStart(4, '0')}ms-wall${atMs}ms-lum${stats.avgLum?.toFixed(3) ?? 'na'}${
        stats.pale ? '-PALE' : ''
      }.png`
      file = path.join(OUT, name)
      fs.writeFileSync(file, Buffer.from(shot.pngB64, 'base64'))
    }

    let dom = null
    try {
      const page = await app.firstWindow({ timeout: 5_000 })
      dom = await page.evaluate(() => ({
        boot: !!document.documentElement.getAttribute('data-boot'),
        htmlSplash: !!document.getElementById('boot-splash'),
        reactSplash: !!document.querySelector('[data-testid="startup-splash"]'),
        shell: !!document.querySelector('.status-bar'),
        theme: document.documentElement.getAttribute('data-theme'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      }))
    } catch {
      /* window may not be ready for CDP yet */
    }

    const entry = {
      markMs: mark,
      atMs,
      file,
      ...stats,
      visible: shot.visible,
      width: shot.width,
      height: shot.height,
      error: shot.error || null,
      dom,
    }
    report.timedFrames.push(entry)
    if (stats.pale) report.paleFrames.push(entry)
    log(
      `mark ${mark}ms wall=${atMs}ms lum=${stats.avgLum?.toFixed(3) ?? 'na'} range=${stats.lumRange?.toFixed(3) ?? 'na'} pale=${stats.pale} dom=${JSON.stringify(dom)}`,
    )
  }

  // --- 假死: minimize, hold, restore, click latency ---
  log(`thaw: minimize + hold ${HOLD_MS}ms`)
  const page = await app.firstWindow({ timeout: 30_000 })
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.isDestroyed()) w.minimize()
  })
  await page.waitForTimeout(HOLD_MS)
  log('thaw: restore + first click')
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w || w.isDestroyed()) return
    w.restore()
    w.show()
    w.focus()
  })
  await page.waitForTimeout(150)
  const clickStart = Date.now()
  await page.mouse.click(420, 320)
  // Probe: can we still query DOM quickly after click?
  const probeStart = Date.now()
  const probe = await page
    .evaluate(() => ({
      shell: !!document.querySelector('.status-bar'),
      theme: document.documentElement.getAttribute('data-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }))
    .catch((e) => ({ error: String(e) }))
  const probeMs = Date.now() - probeStart
  const clickLatencyMs = Date.now() - clickStart

  const thawShot = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed())
    if (!w) return null
    const img = await w.capturePage()
    return {
      pngB64: Buffer.from(img.toPNG()).toString('base64'),
      bitmapB64: Buffer.from(img.toBitmap()).toString('base64'),
    }
  })
  let thawLum = null
  let thawFile = null
  if (thawShot?.pngB64) {
    thawLum = lumOfBitmap(Buffer.from(thawShot.bitmapB64, 'base64'))
    thawFile = path.join(
      OUT,
      `thaw-after-hold-click${clickLatencyMs}ms-lum${thawLum.avgLum.toFixed(3)}${thawLum.pale ? '-PALE' : ''}.png`,
    )
    fs.writeFileSync(thawFile, Buffer.from(thawShot.pngB64, 'base64'))
  }

  report.thaw = {
    holdMs: HOLD_MS,
    clickLatencyMs,
    probeMs,
    probe,
    lum: thawLum,
    file: thawFile,
    frozen: clickLatencyMs > 3000 || probeMs > 3000,
  }
  log(
    `thaw clickLatency=${clickLatencyMs}ms probe=${probeMs}ms frozen=${report.thaw.frozen} lum=${thawLum?.avgLum?.toFixed(3)}`,
  )

  const paleCount = report.paleFrames.length
  const frozen = !!report.thaw.frozen
  report.verdict = {
    pass: paleCount === 0 && !frozen,
    paleCount,
    frozen,
    note:
      paleCount === 0 && !frozen
        ? 'PASS — no pale full-window flash; thaw click OK'
        : `REPRO — paleFrames=${paleCount} frozen=${frozen} clickLatency=${clickLatencyMs}ms`,
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  const md = [
    '# Startup truth evidence',
    '',
    `- pale rule: avgLum>=${PALE_AVG} && lumRange<=${PALE_RANGE}`,
    `- thaw hold: ${HOLD_MS}ms`,
    `- verdict: ${report.verdict.note}`,
    '',
    '| markMs | wallMs | avgLum | range | pale | boot | splash | shell | theme | bodyBg |',
    '|--------|--------|--------|-------|------|------|--------|-------|-------|--------|',
    ...report.timedFrames.map((f) => {
      const d = f.dom || {}
      return `| ${f.markMs} | ${f.atMs} | ${f.avgLum?.toFixed(3) ?? f.error} | ${f.lumRange?.toFixed(3) ?? ''} | ${f.pale} | ${d.boot} | ${d.htmlSplash}/${d.reactSplash} | ${d.shell} | ${d.theme} | ${d.bodyBg || ''} |`
    }),
    '',
    `Thaw: clickLatency=${clickLatencyMs}ms probe=${probeMs}ms frozen=${frozen}`,
    '',
  ].join('\n')
  fs.writeFileSync(path.join(OUT, 'EVIDENCE.md'), md)
  log(report.verdict.note)
  process.exit(report.verdict.pass ? 0 : 2)
} catch (err) {
  report.errors.push(String(err?.stack || err))
  report.verdict = { pass: false, note: 'CRASH', error: String(err) }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.error('[truth] crash', err)
  process.exit(1)
} finally {
  try {
    await app?.close()
  } catch {
    /* ignore */
  }
}
