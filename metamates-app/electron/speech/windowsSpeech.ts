/**
 * Windows 内置语音识别（System.Speech），作为 Electron Web Speech 的离线回退。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { killProcessTree, trackManagedProcess, untrackManagedProcess } from '../shared/processTreeKill'

let speechProcess: ChildProcessWithoutNullStreams | null = null
let intentionalStop = false
let activeSessionId = 0
let stderrBuffer = ''

export type WindowsSpeechTranscript = {
  final: string
  interim: string
}

export type WindowsSpeechStartResult = {
  success: boolean
  error?: string
}

/**
 * @returns 当前平台是否可使用 Windows 原生语音识别
 */
export function isWindowsSpeechAvailable(): boolean {
  return process.platform === 'win32'
}

function cultureFromLanguage(language: string): string {
  if (language.startsWith('zh')) return 'zh-CN'
  if (language.startsWith('ja')) return 'ja-JP'
  if (language.startsWith('ko')) return 'ko-KR'
  return 'en-US'
}

function detachProcessHandlers(proc: ChildProcessWithoutNullStreams): void {
  proc.stdout.removeAllListeners('data')
  proc.stderr.removeAllListeners('data')
  proc.removeAllListeners('error')
  proc.removeAllListeners('exit')
}

function isBenignStderr(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (trimmed.includes('CLIXML')) return true
  if (trimmed.includes('ProgressPreference')) return true
  if (/^#+</.test(trimmed)) return true
  return false
}

/** PowerShell progress records often arrive on stderr in fragmented CLIXML chunks. */
function consumeStderrChunk(chunk: string): string | null {
  stderrBuffer += chunk
  if (stderrBuffer.includes('CLIXML') || stderrBuffer.startsWith('#<')) {
    if (stderrBuffer.includes('</Objs>') || stderrBuffer.length > 4096) {
      stderrBuffer = ''
    }
    return null
  }
  const msg = stderrBuffer.trim()
  stderrBuffer = ''
  if (!msg || isBenignStderr(msg)) return null
  return msg
}

function buildSpeechScript(culture: string): string {
  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [Console]::OutputEncoding
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$ErrorActionPreference = 'Stop'
$target = '${culture}'
$recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
if (-not $recognizers -or $recognizers.Count -le 0) { throw 'no-recognizers-installed' }
$ri = $recognizers | Where-Object { $_.Culture -and $_.Culture.Name -eq $target } | Select-Object -First 1
if (-not $ri) { $ri = $recognizers | Select-Object -First 1 }
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($ri)
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(2)
$engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(650)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(950)
$engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
$engine.SetInputToDefaultAudioDevice()
$engine.add_SpeechHypothesized({
  param($sender, $e)
  if ($e.Result -and $e.Result.Text) {
    [Console]::Out.WriteLine(('INTERIM:' + $e.Result.Text))
    [Console]::Out.Flush()
  }
})
$engine.add_SpeechRecognized({
  param($sender, $e)
  if ($e.Result -and $e.Result.Text) {
    [Console]::Out.WriteLine(('FINAL:' + $e.Result.Text))
    [Console]::Out.Flush()
  }
})
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
[Console]::Out.WriteLine(('READY:' + $engine.RecognizerInfo.Culture.Name))
[Console]::Out.Flush()
while ($true) { Start-Sleep -Seconds 3600 }
`
}

/**
 * 启动 Windows 听写识别；stdout 行 `FINAL:` / `INTERIM:` 回调转写片段。
 * 仅在输出 READY 后视为启动成功，避免误报 stderr 或旧进程干扰。
 */
export function startWindowsSpeech(
  language: string,
  onTranscript: (update: WindowsSpeechTranscript) => void,
  onError: (message: string) => void,
): Promise<WindowsSpeechStartResult> {
  if (!isWindowsSpeechAvailable()) {
    return Promise.resolve({ success: false, error: 'platform-unsupported' })
  }

  stopWindowsSpeech()

  const sessionId = ++activeSessionId
  const culture = cultureFromLanguage(language)
  intentionalStop = false
  stderrBuffer = ''

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: WindowsSpeechStartResult) => {
      if (settled || sessionId !== activeSessionId) return
      settled = true
      resolve(result)
    }

    try {
      const proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-Command', buildSpeechScript(culture)],
        { windowsHide: true },
      )
      speechProcess = proc
      trackManagedProcess(proc.pid)

      const startupTimer = setTimeout(() => {
        finish({ success: false, error: 'startup-timeout' })
      }, 12_000)

      proc.stdout.on('data', (chunk: Buffer) => {
        if (sessionId !== activeSessionId) return
        for (const line of chunk.toString('utf8').split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (trimmed === 'READY' || trimmed.startsWith('READY:')) {
            clearTimeout(startupTimer)
            finish({ success: true })
            continue
          }
          if (trimmed.startsWith('FINAL:')) {
            const text = trimmed.slice('FINAL:'.length).trim()
            if (text) onTranscript({ final: text, interim: '' })
          } else if (trimmed.startsWith('INTERIM:')) {
            const text = trimmed.slice('INTERIM:'.length).trim()
            onTranscript({ final: '', interim: text })
          }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        if (sessionId !== activeSessionId) return
        const fatal = consumeStderrChunk(chunk.toString('utf8'))
        if (!fatal) return
        clearTimeout(startupTimer)
        if (!settled) {
          finish({ success: false, error: fatal })
          return
        }
        onError(fatal)
      })

      proc.on('error', (err) => {
        if (sessionId !== activeSessionId || intentionalStop) return
        clearTimeout(startupTimer)
        const message = err.message
        if (!settled) {
          finish({ success: false, error: message })
          return
        }
        onError(message)
      })

      proc.on('exit', (code) => {
        if (sessionId !== activeSessionId) return
        clearTimeout(startupTimer)
        const stopped = intentionalStop
        intentionalStop = false
        if (speechProcess === proc) speechProcess = null
        detachProcessHandlers(proc)
        if (!settled) {
          finish({
            success: false,
            error: stopped ? 'stopped' : `windows-speech-exit-${code ?? 'unknown'}`,
          })
          return
        }
        if (!stopped && code !== 0 && code !== null) {
          onError(`windows-speech-exit-${code}`)
        }
      })
    } catch (err) {
      speechProcess = null
      finish({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}

/** 停止 Windows 语音识别子进程 */
export function stopWindowsSpeech(): void {
  if (!speechProcess) return
  intentionalStop = true
  activeSessionId += 1
  stderrBuffer = ''
  const proc = speechProcess
  speechProcess = null
  detachProcessHandlers(proc)
  untrackManagedProcess(proc.pid)
  killProcessTree(proc.pid, { force: true })
}

/** 是否正在识别 */
export function isWindowsSpeechRunning(): boolean {
  return speechProcess !== null
}
