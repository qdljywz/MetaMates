#!/usr/bin/env node
/**
 * Standalone voice input tester — same System.Speech path as MetaMates Electron app.
 *
 * Usage:
 *   npm run voice:standalone
 *   npm run voice:standalone -- --lang zh-CN --seconds 120
 *   node scripts/standalone-voice-input.mjs --diag-only
 *
 * Speak into the default microphone. INTERIM / FINAL lines print to the terminal.
 * Press Ctrl+C to stop.
 */

import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const { startWindowsSpeech, stopWindowsSpeech } = require('./lib/standalone-windows-speech.cjs')

const args = process.argv.slice(2)

function readArg(name, fallback) {
  const idx = args.indexOf(name)
  if (idx === -1 || idx === args.length - 1) return fallback
  return args[idx + 1]
}

const lang = readArg('--lang', 'zh-CN')
const seconds = Number.parseInt(readArg('--seconds', '0'), 10) || 0
const diagOnly = args.includes('--diag-only')
const debugAudio = args.includes('--debug-audio')

function ts() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function runDiagnostics() {
  console.log('=== MetaMates 语音独立测试 · 环境诊断 ===\n')
  if (process.platform !== 'win32') {
    console.log('平台: 非 Windows，System.Speech 不可用')
    return false
  }
  console.log('平台: Windows')
  console.log(`目标语言: ${lang}`)

  const diagScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diag-speech.ps1')
  const diag = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-STA', '-File', diagScript],
    { encoding: 'utf8' },
  )
  if (diag.stdout?.trim()) {
    console.log('\n' + diag.stdout.trim())
  }
  if (diag.status !== 0) {
    console.error('\n诊断失败:', diag.stderr?.trim() || diag.stdout?.trim() || `exit ${diag.status}`)
    return false
  }
  console.log('')
  return true
}

async function main() {
  if (!runDiagnostics()) {
    process.exit(1)
  }
  if (diagOnly) {
    process.exit(0)
  }

  console.log('=== 开始监听（与主程序相同逻辑）===')
  console.log('对着默认麦克风说话。看到 INTERIM / FINAL 即表示识别链路正常。')
  console.log('按 Ctrl+C 结束。\n')

  let interimCount = 0
  let finalCount = 0
  let audioEvents = 0
  let speechDetected = 0
  let lastInterim = ''

  const result = await startWindowsSpeech(
    lang,
    (update) => {
      if (typeof update.audioLevel === 'number') {
        audioEvents += 1
        if (audioEvents <= 30 || audioEvents % 20 === 0) {
          console.log(`[${ts()}] AUDIO(${audioEvents}): ${update.audioLevel}`)
        }
        return
      }
      if (update.detected) {
        speechDetected += 1
        console.log(`[${ts()}] DETECTED(${speechDetected})`)
        return
      }
      if (update.interim) {
        interimCount += 1
        lastInterim = update.interim
        process.stdout.write(`\r[${ts()}] INTERIM: ${update.interim}`.padEnd(80))
        return
      }
      if (update.final) {
        finalCount += 1
        if (lastInterim) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r')
          lastInterim = ''
        }
        console.log(`[${ts()}] FINAL:   ${update.final}`)
      }
    },
    (err) => {
      console.error(`\n[${ts()}] ERROR: ${err}`)
    },
    { debugAudio },
  )

  if (!result.success) {
    console.error('启动失败:', result.error || 'unknown')
    process.exit(1)
  }

  const readyCulture = result.readyLine?.startsWith('READY:')
    ? result.readyLine.slice('READY:'.length)
    : '(unknown)'
  console.log(`[${ts()}] READY · 识别器语言: ${readyCulture}`)
  console.log(`[${ts()}] 正在监听…\n`)

  const shutdown = (reason) => {
    console.log(`\n[${ts()}] 停止 (${reason})`)
    console.log(`统计: INTERIM=${interimCount}, FINAL=${finalCount}`)
    if (debugAudio) {
      console.log(`统计: AUDIO_EVENTS=${audioEvents}, SPEECH_DETECTED=${speechDetected}`)
    }
    stopWindowsSpeech()
    if (finalCount === 0 && interimCount === 0) {
      console.log('\n未收到任何识别结果。可能原因:')
      console.log('  1. 默认麦克风静音 / 音量过低')
      console.log('  2. 系统未把输入路由到当前默认录音设备')
      console.log('  3. 说话太短或环境噪音过大')
      console.log('  4. Windows 隐私设置未允许桌面应用访问麦克风')
      if (debugAudio && audioEvents === 0) {
        console.log('  5. 调试线索: AUDIO_EVENTS=0，识别器可能没收到任何麦克风信号')
      }
    }
    process.exit(finalCount > 0 || interimCount > 0 ? 0 : 2)
  }

  process.on('SIGINT', () => shutdown('Ctrl+C'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  if (seconds > 0) {
    setTimeout(() => shutdown(`超时 ${seconds}s`), seconds * 1000)
  }
}

main().catch((err) => {
  console.error(err)
  stopWindowsSpeech()
  process.exit(1)
})
