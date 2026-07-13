export type SpeechEnginePreference = 'auto' | 'whisper' | 'web' | 'native'
export type ResolvedSpeechBackend = 'whisper' | 'web' | 'native' | 'none'

/**
 * Pick speech backend from user preference and runtime availability.
 * `auto` prefers local Whisper (offline), then Windows native, then Web Speech.
 */
export function resolveSpeechBackend(
  preference: SpeechEnginePreference | undefined,
  webAvailable: boolean,
  nativeAvailable: boolean,
  whisperAvailable: boolean,
): ResolvedSpeechBackend {
  const pref = preference ?? 'auto'

  if (pref === 'whisper') {
    if (whisperAvailable) return 'whisper'
    return 'none'
  }

  if (pref === 'web') {
    if (webAvailable) return 'web'
    if (whisperAvailable) return 'whisper'
    if (nativeAvailable) return 'native'
    return 'none'
  }

  if (pref === 'native') {
    if (nativeAvailable) return 'native'
    if (whisperAvailable) return 'whisper'
    if (webAvailable) return 'web'
    return 'none'
  }

  if (whisperAvailable) return 'whisper'
  if (nativeAvailable) return 'native'
  if (webAvailable) return 'web'
  return 'none'
}
