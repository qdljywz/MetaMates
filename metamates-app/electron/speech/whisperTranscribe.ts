/**
 * Whisper transcription — delegates to optional offline-speech plugin.
 */

import {
  isOfflineSpeechPluginReady,
  transcribeViaOfflineSpeechPlugin,
  type WhisperTranscribePayload,
} from '../pluginRuntime/offlineSpeechPlugin'

export type { WhisperTranscribePayload }

export function isWhisperSpeechAvailable(): boolean {
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return false
  }
  return isOfflineSpeechPluginReady()
}

export async function transcribeAudioBlob(payload: WhisperTranscribePayload): Promise<string> {
  return transcribeViaOfflineSpeechPlugin(payload)
}
