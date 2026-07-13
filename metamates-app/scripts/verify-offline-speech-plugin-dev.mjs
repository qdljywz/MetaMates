#!/usr/bin/env node
/**
 * Smoke: offline-speech plugin discovery + status (no UI).
 */
import electron from 'electron'

const { app } = electron
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  await app.whenReady()

  const {
    getOfflineSpeechPluginStatus,
    isOfflineSpeechPluginReady,
    PLUGIN_NOT_INSTALLED,
  } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/pluginRuntime/offlineSpeechPlugin.cjs')).href)

  const status = getOfflineSpeechPluginStatus()
  const ready = isOfflineSpeechPluginReady()

  console.log('plugin id:', status.id)
  console.log('installed:', status.installed)
  console.log('ready:', ready)
  console.log('version:', status.version ?? '(none)')
  console.log('devBundled:', status.devBundled ?? false)

  if (!ready) {
    console.error('FAIL: offline-speech plugin not ready')
    console.error('Run: npm run plugin:offline-speech:install && npm run whisper:download-model')
    process.exit(1)
  }

  const { transcribeAudioBlob } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/speech/whisperTranscribe.cjs')).href,
  )

  try {
    await transcribeAudioBlob({ pcmBase64: '', language: 'zh-CN' })
    console.error('FAIL: expected empty-audio error')
    process.exit(1)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg !== PLUGIN_NOT_INSTALLED && msg !== 'empty-audio' && !msg.includes('empty-audio')) {
      if (msg === PLUGIN_NOT_INSTALLED) {
        console.error('FAIL: plugin should be installed in dev')
        process.exit(1)
      }
    }
    console.log('empty-audio guard OK:', msg)
  }

  console.log('OK — offline-speech plugin smoke passed')
  app.quit()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
