import { spawn } from 'child_process'

const culture = 'zh-CN'
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

const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { windowsHide: true })
proc.stdout.on('data', (c) => console.log('stdout', c.toString()))
proc.stderr.on('data', (c) => console.log('stderr', c.toString()))
proc.on('exit', (code) => console.log('exit', code))
proc.on('error', (e) => console.log('error', e.message))
setTimeout(() => { proc.kill(); process.exit(0) }, 5000)
