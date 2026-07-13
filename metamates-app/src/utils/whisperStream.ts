/** Rolling Whisper pass interval while the mic is open (ms). */
export const WHISPER_STREAM_INTERVAL_MS = 2200

/** Minimum encoded audio size before attempting a streaming pass. */
export const WHISPER_MIN_BLOB_BYTES = 2048

export function buildWhisperRecordingBlob(chunks: Blob[], mimeType: string): Blob | null {
  if (!chunks.length) return null
  const blob = new Blob(chunks, { type: mimeType })
  if (blob.size < WHISPER_MIN_BLOB_BYTES) return null
  return blob
}
