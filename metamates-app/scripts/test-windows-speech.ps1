[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $culture = [System.Globalization.CultureInfo]::GetCultureInfo('zh-CN')
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $engine.SetInputToDefaultAudioDevice()
  Write-Output 'SPEECH_OK'
} catch {
  Write-Output "SPEECH_ERROR: $($_.Exception.Message)"
  exit 1
}
