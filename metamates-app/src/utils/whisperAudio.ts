const WHISPER_SAMPLE_RATE = 16000

export function resamplePcm(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = (i * fromRate) / toRate
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = input[idx] ?? 0
    const b = input[Math.min(idx + 1, input.length - 1)] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

export function float32ToBase64(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function blobToWhisperPcm(blob: Blob): Promise<{ pcmBase64: string; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
    let pcm = audioBuffer.getChannelData(0)
    if (audioBuffer.numberOfChannels > 1) {
      const mixed = new Float32Array(pcm.length)
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const channel = audioBuffer.getChannelData(ch)
        for (let i = 0; i < mixed.length; i++) {
          mixed[i] += channel[i] / audioBuffer.numberOfChannels
        }
      }
      pcm = mixed
    }
    const resampled = resamplePcm(pcm, audioBuffer.sampleRate, WHISPER_SAMPLE_RATE)
    return {
      pcmBase64: float32ToBase64(resampled),
      sampleRate: WHISPER_SAMPLE_RATE,
    }
  } finally {
    await audioCtx.close()
  }
}
