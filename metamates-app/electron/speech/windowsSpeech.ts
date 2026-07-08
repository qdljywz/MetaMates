/**
 * Windows 内置语音识别（System.Speech），作为 Electron Web Speech 的离线回退。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { killProcessTree } from '../shared/processTreeKill'

let speechProcess: ChildProcessWithoutNullStreams | null = null
let intentionalStop = false

export type WindowsSpeechTranscript = {
  final: string
  interim: string
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

function isBenignStderr(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('#< CLIXML')) return true
  if (trimmed.includes('ProgressPreference')) return true
  return false
}

/**
 * 启动 Windows 听写识别；stdout 行 `FINAL:` / `INTERIM:` 回调转写片段。
 */
export function startWindowsSpeech(
  language: string,
  onTranscript: (update: WindowsSpeechTranscript) => void,
  onError: (message: string) => void,
): boolean {
  if (!isWindowsSpeechAvailable()) return false

  stopWindowsSpeech()

  const culture = cultureFromLanguage(language)
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Speech
$ErrorActionPreference = 'Stop'
$culture = [System.Globalization.CultureInfo]::GetCultureInfo('${culture}')
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
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
while ($true) { Start-Sleep -Seconds 3600 }
`

  intentionalStop = false

  try {
    speechProcess = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
      { windowsHide: true },
    )

    speechProcess.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed.startsWith('FINAL:')) {
          const text = trimmed.slice('FINAL:'.length).trim()
          if (text) onTranscript({ final: text, interim: '' })
        } else if (trimmed.startsWith('INTERIM:')) {
          const text = trimmed.slice('INTERIM:'.length).trim()
          onTranscript({ final: '', interim: text })
        }
      }
    })

    speechProcess.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf8').trim()
      if (isBenignStderr(msg)) return
      onError(msg)
    })

    speechProcess.on('error', (err) => {
      if (intentionalStop) return
      onError(err.message)
      speechProcess = null
    })

    speechProcess.on('exit', (code) => {
      const stopped = intentionalStop
      intentionalStop = false
      speechProcess = null
      if (!stopped && code !== 0 && code !== null) {
        onError(`windows-speech-exit-${code}`)
      }
    })

    return true
  } catch (err) {
    speechProcess = null
    onError(err instanceof Error ? err.message : String(err))
    return false
  }
}

/** 停止 Windows 语音识别子进程 */
export function stopWindowsSpeech(): void {
  if (!speechProcess) return
  intentionalStop = true
  const pid = speechProcess.pid
  speechProcess = null
  killProcessTree(pid, { force: true })
}

/** 是否正在识别 */
export function isWindowsSpeechRunning(): boolean {
  return speechProcess !== null
}
