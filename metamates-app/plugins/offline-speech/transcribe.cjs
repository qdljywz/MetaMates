'use strict'

const fs = require('fs')
const path = require('path')

/** Prevent TS/CommonJS emit from rewriting dynamic import to require(). */
async function dynamicImport(specifier) {
  const importer = new Function('specifier', 'return import(specifier)')
  return importer(specifier)
}

let transcriberPromise = null

function whisperLanguageTag(language) {
  if (language.startsWith('zh')) return 'chinese'
  if (language.startsWith('ja')) return 'japanese'
  if (language.startsWith('ko')) return 'korean'
  return 'english'
}

function resolveWhisperModelPath() {
  const fromEnv = process.env.METAMATES_WHISPER_MODEL?.trim()
  const candidates = []
  if (fromEnv) candidates.push(fromEnv)
  candidates.push(path.join(__dirname, 'models', 'whisper-tiny'))
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'config.json'))) {
      return dir
    }
  }
  return path.join(__dirname, 'models', 'whisper-tiny')
}

function isModelReady() {
  return fs.existsSync(path.join(resolveWhisperModelPath(), 'config.json'))
}

async function loadTranscriber() {
  const cacheRoot = process.env.METAMATES_SPEECH_CACHE_DIR?.trim() || path.join(__dirname, '.cache')
  const cacheDir = path.join(cacheRoot, 'transformers-cache')
  fs.mkdirSync(cacheDir, { recursive: true })
  process.env.TRANSFORMERS_CACHE = cacheDir
  process.env.HF_HUB_CACHE = cacheDir

  const transformers = await dynamicImport('@xenova/transformers')
  transformers.env.allowLocalModels = true
  transformers.env.allowRemoteModels = false
  transformers.env.useFSCache = true
  transformers.env.cacheDir = cacheDir

  const modelPath = resolveWhisperModelPath()
  if (!fs.existsSync(path.join(modelPath, 'config.json'))) {
    throw new Error('whisper-model-missing')
  }
  transformers.env.localModelPath = modelPath
  return transformers.pipeline('automatic-speech-recognition', '.', { local_files_only: true })
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = loadTranscriber()
  }
  return transcriberPromise
}

function extractWhisperText(output) {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    return output.map((item) => item.text ?? '').join(' ')
  }
  return output.text ?? ''
}

function pcmBase64ToFloat32(pcmBase64) {
  const bytes = Buffer.from(pcmBase64, 'base64')
  if (bytes.byteLength < 512 || bytes.byteLength % 4 !== 0) {
    throw new Error('audio-too-short')
  }
  const copy = Buffer.from(bytes)
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4)
}

async function decodeAudioBuffer(buffer) {
  const decodeModule = await dynamicImport('audio-decode')
  const decodeFn =
    typeof decodeModule === 'function'
      ? decodeModule
      : typeof decodeModule.default === 'function'
        ? decodeModule.default
        : null
  if (!decodeFn) {
    throw new Error('audio-decode-unavailable')
  }
  return decodeFn(buffer)
}

async function encodedBlobToPcm(buffer, mimeType) {
  if (mimeType.includes('wav')) {
    const waveModule = await dynamicImport('wavefile')
    const WaveFile = waveModule.default.WaveFile
    const wav = new WaveFile(buffer)
    const samples = wav.getSamples(true, Float32Array)
    const pcm =
      samples instanceof Float32Array
        ? samples
        : new Float32Array(Array.from(samples))
    return { pcm, sampleRate: wav.fmt.sampleRate }
  }

  const audioBuffer = await decodeAudioBuffer(buffer)
  return { pcm: audioBuffer.getChannelData(0), sampleRate: audioBuffer.sampleRate }
}

/**
 * @param {{ base64?: string, mimeType?: string, pcmBase64?: string, sampleRate?: number, language: string }} payload
 */
async function transcribeAudio(payload) {
  let pcm
  let sampleRate = payload.sampleRate ?? 16000

  if (payload.pcmBase64?.trim()) {
    pcm = pcmBase64ToFloat32(payload.pcmBase64)
  } else if (payload.base64?.trim()) {
    const buffer = Buffer.from(payload.base64, 'base64')
    if (buffer.length < 256) {
      throw new Error('audio-too-short')
    }
    const decoded = await encodedBlobToPcm(buffer, payload.mimeType ?? 'audio/webm')
    pcm = decoded.pcm
    sampleRate = decoded.sampleRate
  } else {
    throw new Error('empty-audio')
  }

  if (pcm.length < 128) {
    throw new Error('audio-too-short')
  }

  const transcriber = await getTranscriber()
  const output = await transcriber(pcm, {
    language: whisperLanguageTag(payload.language),
    task: 'transcribe',
    return_timestamps: false,
  })

  return extractWhisperText(output).trim()
}

module.exports = {
  isAvailable() {
    return isModelReady()
  },
  transcribeAudio,
}
