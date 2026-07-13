import { app, BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { autoUpdater } from 'electron-updater'
import { allowImmediateQuit, runAppShutdown } from './processLifecycle'

export type UpdaterStatusPayload =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }
  | { status: 'dev' }

let getMainWindow: (() => BrowserWindow | null) | null = null

function sendStatus(payload: UpdaterStatusPayload): void {
  const win = getMainWindow?.()
  if (!win || win.isDestroyed()) return
  const contents = win.webContents
  if (contents.isDestroyed()) return
  try {
    contents.send('updater-status', payload)
  } catch {
    // Frame may be mid-navigation during startup splash handoff.
  }
}

function wireAutoUpdaterEvents(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => sendStatus({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => sendStatus({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) =>
    sendStatus({ status: 'not-available', version: info.version }),
  )
  autoUpdater.on('download-progress', (progress) =>
    sendStatus({ status: 'downloading', percent: progress.percent }),
  )
  autoUpdater.on('update-downloaded', (info) => sendStatus({ status: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => sendStatus({ status: 'error', message: err.message }))
}

export function registerUpdaterHandlers(resolveMainWindow: () => BrowserWindow | null): void {
  getMainWindow = resolveMainWindow

  ipcMain.handle('get-app-version', async () => app.getVersion())
  ipcMain.handle('get-runtime-info', async () => ({ isPackaged: app.isPackaged }))

  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml')
  if (!fs.existsSync(updateConfigPath)) {
    ipcMain.handle('updater-check', async () => ({ ok: true, skipped: true }))
    ipcMain.handle('updater-quit-and-install', async () => ({ ok: false, error: 'no-update-channel' }))
    return
  }

  if (!app.isPackaged) {
    ipcMain.handle('updater-check', async () => ({ ok: true, dev: true }))
    ipcMain.handle('updater-quit-and-install', async () => ({ ok: false, error: 'dev-mode' }))
    return
  }

  wireAutoUpdaterEvents()

  ipcMain.handle('updater-check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, updateInfo: result?.updateInfo ?? null }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      sendStatus({ status: 'error', message })
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('updater-quit-and-install', async () => {
    try {
      await Promise.race([
        runAppShutdown(),
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[UPDATER] Shutdown before install failed:', message)
    }
    allowImmediateQuit()
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[UPDATER] Startup check failed:', message)
    })
  }, 30_000)
}
