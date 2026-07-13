import { describe, expect, it } from 'vitest'
import { buildWhisperRecordingBlob, WHISPER_MIN_BLOB_BYTES } from './whisperStream'

describe('buildWhisperRecordingBlob', () => {
  it('returns null for empty chunks', () => {
    expect(buildWhisperRecordingBlob([], 'audio/webm')).toBeNull()
  })

  it('returns null when blob is too small', () => {
    const tiny = new Blob([new Uint8Array(WHISPER_MIN_BLOB_BYTES - 1)], { type: 'audio/webm' })
    expect(buildWhisperRecordingBlob([tiny], 'audio/webm')).toBeNull()
  })

  it('returns blob when large enough', () => {
    const chunk = new Blob([new Uint8Array(WHISPER_MIN_BLOB_BYTES)], { type: 'audio/webm' })
    const blob = buildWhisperRecordingBlob([chunk], 'audio/webm')
    expect(blob?.size).toBeGreaterThanOrEqual(WHISPER_MIN_BLOB_BYTES)
  })
})
