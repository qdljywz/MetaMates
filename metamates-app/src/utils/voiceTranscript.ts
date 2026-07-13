/** Merge streaming speech fragments into chat input display text. */
export function mergeVoiceTranscript(
  prefix: string,
  accumulatedFinal: string,
  update: { final: string; interim: string },
): { accumulatedFinal: string; display: string } {
  const nextFinal = update.final ? accumulatedFinal + update.final : accumulatedFinal
  return {
    accumulatedFinal: nextFinal,
    display: `${prefix}${nextFinal}${update.interim}`,
  }
}

/** Map native System.Speech / IPC error strings to Web Speech error codes. */
export function mapNativeSpeechError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('access') || lower.includes('denied') || lower.includes('permission')) {
    return 'not-allowed'
  }
  if (lower.includes('audio') || lower.includes('microphone') || lower.includes('capture')) {
    return 'audio-capture'
  }
  if (lower.includes('network') || lower.includes('google')) {
    return 'network'
  }
  if (lower.includes('timeout')) {
    return 'start-failed'
  }
  return 'native-failed'
}

/** Map local Whisper transcription errors to UI error codes. */
export function mapWhisperSpeechError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('plugin_not_installed') || lower === 'plugin_not_installed') {
    return 'whisper-plugin'
  }
  if (lower.includes('whisper-model-missing') || lower.includes('model-missing')) {
    return 'whisper-model'
  }
  if (lower.includes('audio-decode-unavailable') || lower.includes('err_require_esm')) {
    return 'whisper-failed'
  }
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('hub') ||
    lower.includes('download') ||
    lower.includes('connect')
  ) {
    return 'whisper-model'
  }
  if (lower.includes('access') || lower.includes('denied') || lower.includes('permission')) {
    return 'not-allowed'
  }
  return 'whisper-failed'
}
