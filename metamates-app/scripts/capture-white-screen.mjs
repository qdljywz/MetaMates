#!/usr/bin/env node
/**
 * Dense cold-start white/cream proof via MAIN-PROCESS capturePage.
 *
 * Luminance is computed INSIDE the Electron main process (raw BGRA) so the
 * Playwright evaluate return stays small — returning every PNG previously
 * truncated the burst at ~2s / ~27 samples.
 *
 * Pass1: seed light theme
 * Pass2: 64×64 center crop as fast as possible for BURST_MS; save a few full PNGs
 *
 * Exit: 0 = pass; 2 = white reproduced; 1 = crash
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
const OUT = path.join(ROOT, 'tmp-white-capture')
const BURST_MS = Number(process.env.METAMATES_WHITE_BURST_MS || 6_000)
const INTERVAL_MS = Number(process.env.METAMATES_WHITE_INTERVAL_MS || 0)
const CROP_W = Number(process.env.METAMATES_WHITE_CROP_W || 64)
const CROP_H = Number(process.env.METAMATES_WHITE_CROP_H || 64)
const SPLASH_GATE_MS = Number(process.env.METAMATES_WHITE_SPLASH_GATE_MS || 6_000)

if (!fs.existsSync(EXE)) {
  console.error('[white-capture] Missing exe:', EXE)
  process.exit(1)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-white-'))
const userDataDir = path.join(freshRoot, 'MetaMates')
fs.mkdirSync(userDataDir, { recursive: true })
fs.writeFileSync(
  path.join(userDataDir, 'settings.json'),
  JSON.stringify({ theme: 'light', lightPalette: 'paper', fontSize: 14, language: 'zh', autoSave: true }, null, 2),
)

const LIGHT_STORAGE = JSON.stringify({
  settings: { theme: 'light', lightPalette: 'paper', fontSize: 14, language: 'zh', autoSave: true },
  version: '1.0.0',
})

const report = {
  exe: EXE,
  userDataDir,
  method: {
    burstMs: BURST_MS,
    targetIntervalMs: INTERVAL_MS,
    crop: { w: CROP_W, h: CROP_H },
    splashGateMs: SPLASH_GATE_MS,
    whiteEmptyRule: 'avgLum>=0.85 && lumRange<=0.60 && atMs<=splashGate',
    analyzeIn: 'electron-main-bgra',
  },
  frames: [],
  whiteEmptyFrames: [],
  fullFrames: [],
  errors: [],
  sampling: null,
  whiteSpan: null,
  verdict: null,
}
const t0 = Date.now()
const log = (m) => console.log(`[white-capture] +${Date.now() - t0}ms ${m}`)

function summarizeSampling(frames) {
  const timed = frames.filter((f) => typeof f.atMs === 'number').sort((a, b) => a.atMs - b.atMs)
  const gaps = []
  for (let i = 1; i < timed.length; i++) gaps.push(timed[i].atMs - timed[i - 1].atMs)
  gaps.sort((a, b) => a - b)
  return {
    sampleCount: timed.length,
    firstAtMs: timed[0]?.atMs ?? null,
    lastAtMs: timed[timed.length - 1]?.atMs ?? null,
    medianGapMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    meanGapMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    maxGapMs: gaps.length ? Math.max(...gaps) : null,
    p90GapMs: gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.9))] : null,
    blindSpotMs: gaps.length ? Math.max(...gaps) : null,
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
  await p1.waitForTimeout(2_000)
  await p1.evaluate((raw) => localStorage.setItem('metamates-storage', raw), LIGHT_STORAGE)
  await app.close()
  app = null
  await new Promise((r) => setTimeout(r, 600))

  log('pass2 cold start + in-process BGRA luminance burst')
  app = await launchApp()

  const waitWinStart = Date.now()
  while (Date.now() - waitWinStart < 30_000) {
    const has = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w && !w.isDestroyed()),
    )
    if (has) break
    await new Promise((r) => setTimeout(r, 20))
  }
  log('BrowserWindow exists — start dense burst')

  const burst = await app.evaluate(
    async ({ BrowserWindow }, { burstMs, intervalMs, cropW, cropH, splashGateMs }) => {
      const frames = []
      const tStart = Date.now()
      const tEnd = tStart + burstMs
      let i = 0
      const lumOfBitmap = (bitmap) => {
        const pixels = (bitmap.length / 4) | 0
        if (pixels <= 0) return { avgLum: 0, lumRange: 0, whiteEmpty: false, empty: true }
        let sum = 0
        let n = 0
        let min = Infinity
        let max = -Infinity
        const step = pixels > 4000 ? 4 : 1
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
        return { avgLum, lumRange, whiteEmpty: avgLum >= 0.85 && lumRange <= 0.6 }
      }

      // Hard wall-clock end — do not let slow captures silently shrink coverage.
      while (Date.now() < tEnd) {
        const at = Date.now() - tStart
        const w = BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed())
        if (!w) {
          frames.push({ i, atMs: at, error: 'no-window', whiteEmpty: false })
          i += 1
          await new Promise((r) => setTimeout(r, intervalMs || 10))
          continue
        }
        try {
          const visible = w.isVisible()
          const { width: bw, height: bh } = w.getBounds()
          const cw = Math.min(cropW, Math.max(32, bw - 8))
          const ch = Math.min(cropH, Math.max(32, bh - 8))
          const rect = {
            x: Math.max(0, Math.floor((bw - cw) / 2)),
            y: Math.max(0, Math.floor((bh - ch) / 2)),
            width: cw,
            height: ch,
          }
          // Time-box capturePage — a hung capture previously stalled the burst at ~2s.
          const img = await Promise.race([
            w.capturePage(rect),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('capturePage-timeout-250ms')), 250)
            }),
          ])
          const size = img.getSize()
          const stats = lumOfBitmap(img.toBitmap())
          const whiteInSplash = stats.whiteEmpty && at <= splashGateMs
          frames.push({
            i,
            atMs: at,
            visible,
            width: size.width,
            height: size.height,
            ...stats,
            whiteEmpty: whiteInSplash,
          })
        } catch (err) {
          frames.push({ i, atMs: at, error: String(err), whiteEmpty: false })
        }
        i += 1
        // Pace even on interval 0 so we cannot spin 1000 empty timeouts/sec after hangs.
        await new Promise((r) => setTimeout(r, intervalMs > 0 ? intervalMs : 30))
      }

      const denseWallMs = Date.now() - tStart

      // Post-burst full snapshots (after dense window — must not affect maxGap).
      const w = BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed())
      const filled = []
      if (w) {
        const picks = []
        const first = frames.find((f) => f.visible && f.avgLum != null)
        const mid = frames.find((f) => f.atMs >= 3000 && f.avgLum != null)
        const last = [...frames].reverse().find((f) => f.avgLum != null)
        const whiteHit = frames.find((f) => f.whiteEmpty)
        for (const f of [first, mid, last, whiteHit]) {
          if (f && !picks.some((p) => p.i === f.i)) picks.push(f)
        }
        for (const f of picks) {
          try {
            const full = await w.capturePage()
            filled.push({
              i: f.i,
              atMs: f.atMs,
              visible: f.visible,
              whiteEmpty: !!f.whiteEmpty,
              note: 'post-burst-current-frame',
              b64: Buffer.from(full.toPNG()).toString('base64'),
            })
          } catch {
            /* ignore */
          }
        }
      }
      return {
        frames,
        fullPngs: filled,
        denseWallMs,
        wallMs: Date.now() - tStart,
        burstMsArg: burstMs,
        sampleLastAtMs: frames.length ? frames[frames.length - 1].atMs : null,
      }
    },
    {
      burstMs: BURST_MS,
      intervalMs: INTERVAL_MS,
      cropW: CROP_W,
      cropH: CROP_H,
      splashGateMs: SPLASH_GATE_MS,
    },
  )

  log(
    `got ${burst.frames.length} samples denseWall=${burst.denseWallMs}ms totalWall=${burst.wallMs}ms burstMsArg=${burst.burstMsArg} lastAt=${burst.sampleLastAtMs}`,
  )

  report.frames = burst.frames
  report.burstMeta = {
    denseWallMs: burst.denseWallMs,
    wallMs: burst.wallMs,
    burstMsArg: burst.burstMsArg,
    sampleLastAtMs: burst.sampleLastAtMs,
  }
  for (const full of burst.fullPngs || []) {
    const file = path.join(
      OUT,
      `full-${String(full.i).padStart(3, '0')}-${full.atMs}ms${full.whiteEmpty ? '-WHITE' : ''}.png`,
    )
    fs.writeFileSync(file, Buffer.from(full.b64, 'base64'))
    report.fullFrames.push({
      i: full.i,
      atMs: full.atMs,
      visible: full.visible,
      whiteEmpty: full.whiteEmpty,
      file,
    })
  }

  report.whiteEmptyFrames = report.frames.filter((f) => f.whiteEmpty)
  report.sampling = summarizeSampling(report.frames)

  try {
    const page = await app.firstWindow({ timeout: 5_000 })
    report.domAtEnd = await page.evaluate(() => ({
      boot: !!document.getElementById('boot-splash'),
      react: !!document.querySelector('[data-testid="startup-splash"]'),
      shell: !!document.querySelector('.status-bar'),
      theme: document.documentElement.getAttribute('data-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }))
    log(`domAtEnd ${JSON.stringify(report.domAtEnd)}`)
  } catch {
    /* ignore */
  }

  const white = report.whiteEmptyFrames
  report.whiteSpan =
    white.length > 0
      ? {
          count: white.length,
          firstMs: white[0].atMs,
          lastMs: white[white.length - 1].atMs,
          durationMs:
            white[white.length - 1].atMs -
            white[0].atMs +
            (report.sampling?.medianGapMs || 20),
        }
      : null

  const withLum = report.frames.filter((f) => f.avgLum != null)
  const firstVis = withLum.find((f) => f.visible)
  const splashLums = withLum.filter((f) => f.atMs <= SPLASH_GATE_MS).map((f) => f.avgLum)
  const maxLumSplash = splashLums.length ? Math.max(...splashLums) : 0
  const minLumSplash = splashLums.length ? Math.min(...splashLums) : 0

  report.verdict = {
    pass: white.length === 0,
    whiteEmptyCount: white.length,
    firstVisibleMs: firstVis?.atMs ?? null,
    firstVisibleAvgLum: firstVis?.avgLum ?? null,
    minAvgLumInSplash: minLumSplash,
    maxAvgLumInSplash: maxLumSplash,
    sampling: report.sampling,
    note:
      white.length === 0
        ? `PASS — 0 white-empty; splash avgLum∈[${minLumSplash.toFixed(3)}, ${maxLumSplash.toFixed(3)}]; samples=${report.sampling?.sampleCount}; medianGap=${report.sampling?.medianGapMs}ms; maxGap=${report.sampling?.maxGapMs}ms`
        : `FAIL — white-empty ×${white.length} span≈${report.whiteSpan?.durationMs}ms (${report.whiteSpan?.firstMs}–${report.whiteSpan?.lastMs})`,
  }

  // Compact timeline in evidence (every sample would be huge — keep all in report.json)
  const step = Math.max(1, Math.floor(withLum.length / 40))
  const timelineRows = withLum
    .filter((_, idx) => idx % step === 0 || withLum[idx].whiteEmpty)
    .map(
      (f) =>
        `| ${f.atMs} | ${f.visible ? 'Y' : 'n'} | ${f.avgLum.toFixed(3)} | ${f.lumRange.toFixed(3)} | ${f.whiteEmpty ? 'YES' : 'no'} |`,
    )
    .join('\n')

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(
    path.join(OUT, 'EVIDENCE.md'),
    `# White-screen capture evidence

- **exe:** \`${EXE}\`
- **burst:** ${BURST_MS}ms wall, target interval ${INTERVAL_MS}ms, crop ${CROP_W}×${CROP_H}
- **analyze:** BGRA luminance in Electron main (no PNG round-trip per sample)
- **rule:** \`${report.method.whiteEmptyRule}\`
- **samples:** ${report.sampling?.sampleCount} (median gap **${report.sampling?.medianGapMs}ms**, p90 **${report.sampling?.p90GapMs}ms**, **max gap ${report.sampling?.maxGapMs}ms**)
- **splash avgLum range:** ${minLumSplash.toFixed(3)} – ${maxLumSplash.toFixed(3)} (white threshold ≥ 0.85)
- **verdict:** ${report.verdict.note}

## Timeline (subsampled for readability; full series in report.json)

| atMs | visible | avgLum | lumRange | whiteEmpty |
|------|---------|--------|----------|------------|
${timelineRows}

## Full-window PNG artifacts

${(report.fullFrames || []).map((f) => `- \`${path.basename(f.file)}\` at +${f.atMs}ms visible=${f.visible} white=${f.whiteEmpty}`).join('\n') || '(none)'}
`,
  )

  log(`report samples=${report.frames.length} whiteEmpty=${white.length} maxGap=${report.sampling?.maxGapMs}ms`)
  console.log('[white-capture] VERDICT', report.verdict.note)

  if (report.whiteSpan) {
    console.log('[white-capture] REPRODUCED', report.whiteSpan)
    process.exit(2)
  }
  process.exit(0)
} catch (err) {
  console.error('[white-capture] CRASH', err)
  try {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...report, crash: String(err) }, null, 2))
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
