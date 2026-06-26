/**
 * Windows 内置语音识别（System.Speech），作为 Electron Web Speech 的离线回退。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

let speechProcess: ChildProcessWithoutNullStreams | null = null

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

/**
 * 启动 Windows 听写识别；结果通过 stdout 行 `FINAL:...` 回调。
 */
export function startWindowsSpeech(
  language: string,
  onTranscript: (text: string) => void,
  onError: (message: string) => void,
): boolean {
  if (!isWindowsSpeechAvailable()) return false

  stopWindowsSpeech()

  const culture = cultureFromLanguage(language)
  const script = `
Add-Type -AssemblyName System.Speech
$ErrorActionPreference = 'Stop'
$culture = [System.Globalization.CultureInfo]::GetCultureInfo('${culture}')
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
$engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
$engine.SetInputToDefaultAudioDevice()
$handler = [System.Speech.Recognition.SpeechRecognizedEventHandler] {
  param($sender, $e)
  if ($e.Result -and $e.Result.Text) {
    [Console]::Out.WriteLine(('FINAL:' + $e.Result.Text))
    [Console]::Out.Flush()
  }
}
$engine.add_SpeechRecognized($handler)
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
while ($true) { Start-Sleep -Seconds 3600 }
`

  try {
    speechProcess = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
      { windowsHide: true },
    )

    speechProcess.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed.startsWith('FINAL:')) {
          const text = trimmed.slice('FINAL:'.length).trim()
          if (text) onTranscript(text)
        }
      }
    })

    speechProcess.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim()
      if (msg) onError(msg)
    })

    speechProcess.on('error', (err) => {
      onError(err.message)
      speechProcess = null
    })

    speechProcess.on('exit', (code) => {
      speechProcess = null
      if (code !== 0 && code !== null) {
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
  try {
    speechProcess.kill()
  } catch {
    /* ignore */
  }
  speechProcess = null
}

/** 是否正在识别 */
export function isWindowsSpeechRunning(): boolean {
  return speechProcess !== null
}
