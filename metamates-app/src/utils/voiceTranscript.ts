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
  if (lower.includes('network') || lower.includes('google')) {
    return 'network'
  }
  return 'native-failed'
}
