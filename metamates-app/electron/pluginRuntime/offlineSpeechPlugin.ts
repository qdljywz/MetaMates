import { createRequire } from 'module'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { OFFLINE_SPEECH_PLUGIN_ID } from './pluginManifest'
import { readPluginManifest, resolveBundledPluginZip, resolvePluginRoot } from './pluginPaths'

export const PLUGIN_NOT_INSTALLED = 'PLUGIN_NOT_INSTALLED'

export type WhisperTranscribePayload = {
  base64?: string
  mimeType?: string
  pcmBase64?: string
  sampleRate?: number
  language: string
}

export interface OfflineSpeechPluginStatus {
  id: string
  installed: boolean
  version?: string
  name?: string
  nameZh?: string
  description?: string
  descriptionZh?: string
  sizeHintMb?: number
  devBundled?: boolean
  bundledZipAvailable?: boolean
}

function whisperModelPath(pluginRoot: string): string {
  return path.join(pluginRoot, 'models', 'whisper-tiny', 'config.json')
}

export function isOfflineSpeechPluginReady(): boolean {
  const pluginRoot = resolvePluginRoot(OFFLINE_SPEECH_PLUGIN_ID)
  if (!pluginRoot) return false
  return fs.existsSync(whisperModelPath(pluginRoot))
}

export function getOfflineSpeechPluginStatus(): OfflineSpeechPluginStatus {
  const installedRoot = resolvePluginRoot(OFFLINE_SPEECH_PLUGIN_ID)
  const manifest = installedRoot ? readPluginManifest(installedRoot) : null
  const devBundled =
    !!installedRoot && installedRoot.includes(`${path.sep}plugins${path.sep}${OFFLINE_SPEECH_PLUGIN_ID}`)

  return {
    id: OFFLINE_SPEECH_PLUGIN_ID,
    installed: isOfflineSpeechPluginReady(),
    version: manifest?.version,
    name: manifest?.name,
    nameZh: manifest?.nameZh,
    description: manifest?.description,
    descriptionZh: manifest?.descriptionZh,
    sizeHintMb: manifest?.sizeHintMb,
    devBundled,
    bundledZipAvailable: !!resolveBundledPluginZip(OFFLINE_SPEECH_PLUGIN_ID),
  }
}

export function pluginRequiredErrorMessage(): string {
  return '需要安装「离线语音识别」扩展才能使用本地 Whisper。请在 设置 → 扩展 中安装。'
}

type OfflineSpeechModule = {
  isAvailable?: () => boolean
  transcribeAudio?: (payload: WhisperTranscribePayload) => Promise<string>
}

export async function transcribeViaOfflineSpeechPlugin(
  payload: WhisperTranscribePayload,
): Promise<string> {
  const pluginRoot = resolvePluginRoot(OFFLINE_SPEECH_PLUGIN_ID)
  if (!pluginRoot) {
    throw new Error(PLUGIN_NOT_INSTALLED)
  }

  const manifest = readPluginManifest(pluginRoot)
  const mainFile = manifest?.main || 'transcribe.cjs'
  const mainPath = path.join(pluginRoot, mainFile)

  process.env.METAMATES_SPEECH_CACHE_DIR = app.getPath('userData')

  try {
    const req = createRequire(mainPath)
    const mod = req(mainPath) as OfflineSpeechModule
    if (typeof mod.transcribeAudio !== 'function') {
      throw new Error('Offline speech plugin is missing transcribeAudio export')
    }
    if (typeof mod.isAvailable === 'function' && !mod.isAvailable()) {
      throw new Error('whisper-model-missing')
    }
    return mod.transcribeAudio(payload)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === PLUGIN_NOT_INSTALLED) throw error
    throw new Error(message)
  }
}
