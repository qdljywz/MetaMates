/**
 * 语音识别 IPC：Windows 原生听写 + 事件转发到渲染进程
 */

import { ipcMain, type BrowserWindow } from 'electron'
import {
  isWindowsSpeechAvailable,
  isWindowsSpeechRunning,
  startWindowsSpeech,
  stopWindowsSpeech,
} from './windowsSpeech'
import { isWhisperSpeechAvailable, transcribeAudioBlob } from './whisperTranscribe'

/**
 * @param getMainWindow - 获取当前主窗口（用于推送 transcript / error）
 */
export function registerSpeechHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('speech-is-available', () => ({
    available: isWhisperSpeechAvailable() || isWindowsSpeechAvailable(),
    whisper: isWhisperSpeechAvailable(),
    native: isWindowsSpeechAvailable(),
    running: isWindowsSpeechRunning(),
  }))

  ipcMain.handle(
    'speech-transcribe-audio',
    async (_event, payload: {
      base64?: string
      mimeType?: string
      pcmBase64?: string
      sampleRate?: number
      language: string
    }) => {
      try {
        const text = await transcribeAudioBlob(payload)
        return { success: true, text }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[speech] whisper transcribe failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle('speech-start', async (_event, language: string = 'zh-CN') => {
    const win = getMainWindow()
    if (!win) return { success: false, error: 'no-window' }

    return startWindowsSpeech(
      language,
      (update) => {
        if (!win.isDestroyed()) {
          win.webContents.send('speech-transcript', update)
        }
      },
      (err) => {
        if (!win.isDestroyed()) {
          win.webContents.send('speech-error', { code: 'native', message: err })
        }
      },
    )
  })

  ipcMain.handle('speech-stop', () => {
    stopWindowsSpeech()
    return { success: true }
  })

  if (process.env.METAMATES_E2E === '1') {
    ipcMain.handle(
      'speech-e2e-inject',
      (_event, update: { final?: string; interim?: string } = {}) => {
        const win = getMainWindow()
        if (!win || win.isDestroyed()) return { success: false, error: 'no-window' }
        win.webContents.send('speech-transcript', {
          final: update.final ?? '',
          interim: update.interim ?? '',
        })
        return { success: true }
      },
    )
  }
}
