[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
Write-Output 'Recognizers:'
[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  ForEach-Object { Write-Output ($_.Culture.Name + ' | ' + $_.Name) }
try {
  $e = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $e.SetInputToDefaultAudioDevice()
  Write-Output 'DEFAULT_MIC_OK'
} catch {
  Write-Output ('DEFAULT_MIC_ERROR: ' + $_.Exception.Message)
}
