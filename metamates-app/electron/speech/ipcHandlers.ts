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

/**
 * @param getMainWindow - 获取当前主窗口（用于推送 transcript / error）
 */
export function registerSpeechHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('speech-is-available', () => ({
    available: isWindowsSpeechAvailable(),
    running: isWindowsSpeechRunning(),
  }))

  ipcMain.handle('speech-start', (_event, language: string = 'zh-CN') => {
    const win = getMainWindow()
    if (!win) return { success: false, error: 'no-window' }

    const ok = startWindowsSpeech(
      language,
      (text) => {
        if (!win.isDestroyed()) {
          win.webContents.send('speech-transcript', { final: text, interim: '' })
        }
      },
      (err) => {
        if (!win.isDestroyed()) {
          win.webContents.send('speech-error', { code: 'native', message: err })
        }
      },
    )

    return { success: ok }
  })

  ipcMain.handle('speech-stop', () => {
    stopWindowsSpeech()
    return { success: true }
  })
}
