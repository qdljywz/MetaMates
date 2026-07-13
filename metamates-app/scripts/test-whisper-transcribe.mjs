#!/usr/bin/env node
/**
 * Diagnose local Whisper transcription outside the UI.
 * Usage: node scripts/test-whisper-transcribe.mjs
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

async function main() {
  await app.whenReady()

  const { transcribeAudioBlob } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/speech/whisperTranscribe.cjs')).href)

  console.log('userData:', app.getPath('userData'))
  console.log('HF_ENDPOINT:', process.env.HF_ENDPOINT || process.env.METAMATES_HF_ENDPOINT || '(unset)')
  console.log('model path env:', process.env.METAMATES_WHISPER_MODEL || '(unset)')

  const fixture = path.join(ROOT, 'test-fixtures', 'sample.wav')
  if (!fs.existsSync(fixture)) {
    console.error('Missing fixture:', fixture)
    process.exit(1)
  }

  const buffer = fs.readFileSync(fixture)
  const base64 = buffer.toString('base64')
  console.log(`fixture bytes: ${buffer.length}`)

  try {
    const text = await transcribeAudioBlob({
      base64,
      mimeType: 'audio/wav',
      language: 'zh-CN',
    })
    console.log('wav path OK:', JSON.stringify(text))
    process.exit(0)
  } catch (err) {
    console.error('FAIL:', err instanceof Error ? `${err.message}\n${err.stack}` : err)
    process.exit(1)
  } finally {
    app.quit()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
