[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'

Write-Output '=== Audio Input Endpoints ==='

try {
  $captureId = $null
  $mediaDeviceType = [type]::GetType('Windows.Media.Devices.MediaDevice, Windows.Media.Devices, ContentType=WindowsRuntime')
  $audioRoleType = [type]::GetType('Windows.Media.Devices.AudioDeviceRole, Windows.Media.Devices, ContentType=WindowsRuntime')
  if ($mediaDeviceType -and $audioRoleType) {
    $defaultRole = [enum]::Parse($audioRoleType, 'Default')
    $captureId = $mediaDeviceType::GetDefaultAudioCaptureId($defaultRole)
    if ($captureId) {
      Write-Output ('DEFAULT_CAPTURE_ID: ' + $captureId)
    }
  }
} catch {
  Write-Output ('DEFAULT_CAPTURE_ID_ERROR: ' + $_.Exception.Message)
}

try {
  $endpoints = Get-PnpDevice -Class AudioEndpoint -ErrorAction Stop |
    Sort-Object Status, FriendlyName
  if (-not $endpoints) {
    Write-Output 'NO_AUDIO_ENDPOINTS'
  } else {
    foreach ($endpoint in $endpoints) {
      $name = if ($endpoint.FriendlyName) { $endpoint.FriendlyName } else { '(unnamed endpoint)' }
      $status = if ($endpoint.Status) { $endpoint.Status } else { '(unknown)' }
      $instance = if ($endpoint.InstanceId) { $endpoint.InstanceId } else { '(no instance id)' }
      $isDefault = if ($captureId -and $instance -like "*$captureId*") { ' default-capture' } else { '' }
      Write-Output ("ENDPOINT: [{0}] {1}{2}" -f $status, $name, $isDefault)
      Write-Output ("  INSTANCE: {0}" -f $instance)
    }
  }
} catch {
  Write-Output ('AUDIO_ENDPOINT_ENUM_ERROR: ' + $_.Exception.Message)
}
