#!/usr/bin/env node
/**
 * Download Xenova/whisper-tiny from hf-mirror.com into plugins/offline-speech/models/whisper-tiny.
 *
 * Usage:
 *   npm run whisper:download-model
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MODEL_ID = 'Xenova/whisper-tiny'
const MIRROR = process.env.METAMATES_HF_ENDPOINT?.replace(/\/$/, '') || 'https://hf-mirror.com'
const LEGACY_DIR = path.join(ROOT, 'resources', 'models', 'whisper-tiny')
const OUT_DIR = process.env.METAMATES_WHISPER_MODEL
  ? path.resolve(process.env.METAMATES_WHISPER_MODEL)
  : path.join(ROOT, 'plugins', 'offline-speech', 'models', 'whisper-tiny')

const FILES = [
  'config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'generation_config.json',
  'added_tokens.json',
  'merges.txt',
  'normalizer.json',
  'vocab.json',
  'special_tokens_map.json',
  'quant_config.json',
  'quantize_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]

function curlDownload(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl'
  const args = ['-fL', '--connect-timeout', '20', '--retry', '3', '--retry-delay', '2', '-o', dest, url]
  const r = spawnSync(curl, args, { encoding: 'utf-8' })
  if (r.status !== 0) {
    throw new Error(`curl failed for ${url}: ${r.stderr || r.stdout || r.status}`)
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function main() {
  if (
    !process.env.METAMATES_WHISPER_MODEL &&
    fs.existsSync(path.join(LEGACY_DIR, 'config.json')) &&
    !fs.existsSync(path.join(OUT_DIR, 'config.json'))
  ) {
    console.log(`Copy legacy model from ${LEGACY_DIR}`)
    copyDir(LEGACY_DIR, OUT_DIR)
  }

  console.log(`Mirror: ${MIRROR}`)
  console.log(`Output: ${OUT_DIR}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (const rel of FILES) {
    const url = `${MIRROR}/${MODEL_ID}/resolve/main/${rel}`
    const dest = path.join(OUT_DIR, rel)
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`skip ${rel}`)
      continue
    }
    console.log(`get  ${rel}`)
    curlDownload(url, dest)
  }

  if (!fs.existsSync(path.join(OUT_DIR, 'config.json'))) {
    throw new Error('download incomplete: config.json missing')
  }
  console.log('Whisper model ready:', OUT_DIR)
}

main()
