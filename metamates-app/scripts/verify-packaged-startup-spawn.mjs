#!/usr/bin/env node
/**
 * Double-click simulation (no Playwright): log milestones from main process stdout.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE =
  process.env.METAMATES_PACKAGED_EXE?.trim() ||
  path.join(ROOT, 'release-startup', 'win-unpacked', 'MetaMates.exe')

if (!fs.existsSync(EXE)) {
  console.error('[spawn-probe] Missing exe:', EXE)
  process.exit(1)
}

const auditRoot = path.join(ROOT, 'startup-audit', `spawn-${Date.now()}`)
fs.mkdirSync(auditRoot, { recursive: true })
const userData = path.join(auditRoot, 'userData')
fs.mkdirSync(userData, { recursive: true })

const milestones = [
  { re: /Boot splash DOM ready/i, phase: 'boot-splash-dom' },
  { re: /Renderer loaded/i, phase: 'renderer-loaded' },
  { re: /desktop window visible/i, phase: 'window-visible' },
  { re: /ready-to-show slow/i, phase: 'forced-show-12s' },
  { re: /界面加载失败|UI failed to load/i, phase: 'load-error' },
]

const t0 = Date.now()
const timeline = []
const logLines = []

const child = spawn(EXE, [`--user-data-dir=${userData}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, METAMATES_E2E: '0' },
})

function onLine(line) {
  logLines.push(line)
  for (const m of milestones) {
    if (m.re.test(line) && !timeline.some((t) => t.phase === m.phase)) {
      const atMs = Date.now() - t0
      timeline.push({ phase: m.phase, atMs, line: line.trim() })
      console.log(`[spawn-probe] +${atMs}ms ${m.phase}`)
    }
  }
}

child.stdout.on('data', (buf) => onLine(buf.toString()))
child.stderr.on('data', (buf) => onLine(buf.toString()))

await new Promise((resolve) => setTimeout(resolve, 25_000))

const alive = child.exitCode === null
if (alive) child.kill()

const report = {
  exe: EXE,
  userData,
  auditRoot,
  aliveAfter25s: alive,
  exitCode: child.exitCode,
  timeline,
  expected: {
    bootSplashDomMs: 12_000,
    rendererLoadedMs: 20_000,
    description: '真实双击：12s 内 boot splash DOM，20s 内 Renderer loaded',
  },
  pass:
    timeline.some((t) => t.phase === 'boot-splash-dom' && t.atMs <= 12_000) &&
    timeline.some((t) => t.phase === 'renderer-loaded' && t.atMs <= 20_000),
}

fs.writeFileSync(path.join(auditRoot, 'spawn.log'), logLines.join('\n'))
fs.writeFileSync(path.join(auditRoot, 'spawn-report.json'), JSON.stringify(report, null, 2))

console.log('[spawn-probe] timeline:', timeline)
console.log('[spawn-probe] pass:', report.pass)
console.log('[spawn-probe] report:', path.join(auditRoot, 'spawn-report.json'))

process.exit(report.pass ? 0 : 1)
