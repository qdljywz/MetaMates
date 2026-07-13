import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, session, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { FSWatcher } from 'fs'
import type { NativeImage } from 'electron'
import { registerAcpIpcHandlers, setAcpMainWindow, startAcpStartupWarmup, syncCliAgentEnabledPreferences } from './acp/ipcHandlers'
import { sessionStore } from './acp/sessionStore'
import * as sessionDb from './acp/sessionDb'
import { closeDatabase, warmupDatabase } from './acp/sessionDb'
import { migrateWorkspace, detectLegacyPaths } from './workspaceMigrate'
import { vaultApiServer } from './vaultApi/server'
import { getCalendarSummary } from './calendar/index'
import { readAppSettings } from './appSettings'
import { getOllamaStatus } from './ollama/client'
import { detectWorkspaceLanguage } from './workspaceLayout'
import { assertWithinWorkspace, pathAssertError, pathAssertResolved, type PathAssertResult } from './shared/pathSafety'
import { getCurrentWorkspacePath, setCurrentWorkspacePath } from './shared/workspaceState'
import { registerDocumentExtractHandlers } from './documentExtract/ipcHandlers'
import { registerPluginHandlers } from './pluginRuntime/ipcHandlers'
import { ensureBundledPluginsInstalled } from './pluginRuntime/ensureBundledPlugins'
import { registerSpeechHandlers } from './speech/ipcHandlers'
import { stopWindowsSpeech } from './speech/windowsSpeech'
import { getMimeTypeFromPath } from './documentExtract/mimeType'
import { getLanIPv4Addresses } from './shared/lanAddresses'
import { ensureWindowsFirewallRule } from './vaultApi/firewall'
import { ensureIntelligenceMemoryLayout, type WorkspaceLanguage as IntelLanguage } from './shared/intelligencePaths'
import { isImmediateQuitAllowed, registerShutdownTask, runAppShutdown } from './processLifecycle'
import { registerUpdaterHandlers } from './updater'
import { registerNativeThemeBridge, syncNativeThemeSource } from './nativeThemeBridge'
import { disconnectAllAcpBackends } from './acp/ipcHandlers'
import {
  killAllSessionChildProcesses,
  killSiblingDevProcesses,
  killStaleMetaMatesProcesses,
} from './shared/processTreeKill'
import { getResourcesRoot, resolveBuildIconPath, resolveInitsRoot, resolveUserManualPath } from './shared/appPaths'
import {
  appendSessionLifecycleEvent,
  installSessionLifecycleLog,
} from './sessionLifecycleLog'

let mainWindow: BrowserWindow | null = null
/** When instant boot splash first painted (packaged cold start). */
let bootSplashAnchorMs: number | null = null

function markBootSplashAnchor(): void {
  if (bootSplashAnchorMs == null) bootSplashAnchorMs = Date.now()
}

function getBootElapsedMs(): number {
  return bootSplashAnchorMs == null ? 0 : Date.now() - bootSplashAnchorMs
}

let resolveDesktopReady: (() => void) | null = null
const desktopReadyPromise = new Promise<void>((resolve) => {
  resolveDesktopReady = resolve
})

function markDesktopReady(): void {
  resolveDesktopReady?.()
  resolveDesktopReady = null
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-ready')
  }
}
let currentWatcher: FSWatcher | null = null
const appRoot = getResourcesRoot()
let shutdownHooksRegistered = false
let quitAfterShutdown = false

const skipSingleInstanceLock = process.env.METAMATES_E2E === '1'

// Some Windows environments crash the GPU process on startup, preventing any window from
// showing (even though electron.exe is running). Prefer a stable UI over acceleration.
if (process.platform === 'win32' && process.env.METAMATES_DISABLE_GPU !== '0') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('use-gl', 'swiftshader')
  app.commandLine.appendSwitch('use-angle', 'swiftshader')
}

const gotSingleInstanceLock = skipSingleInstanceLock || app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  appendSessionLifecycleEvent('single_instance_denied', {
    detail: 'Another MetaMates instance holds the lock',
  })
  app.quit()
  process.exit(0)
}

installSessionLifecycleLog()

function getDialogParentWindow(): BrowserWindow | undefined {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
}

function resolveWorkspacePath(filePath: string): PathAssertResult {
  const workspace = getCurrentWorkspacePath()
  if (!workspace) return { ok: false, error: 'No workspace selected' }
  return assertWithinWorkspace(workspace, filePath)
}

/** Prevent uncaught EPIPE when stdout/stderr have no reader (GUI launch, closed terminal). */
function installBrokenPipeGuard(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return
    })
  }
}
installBrokenPipeGuard()

function closeFileWatcher(): void {
  if (!currentWatcher) return
  currentWatcher.close()
  currentWatcher = null
}

function registerAppShutdownHooks(): void {
  if (shutdownHooksRegistered) return
  shutdownHooksRegistered = true

  registerShutdownTask(() => {
    disconnectAllAcpBackends()
  })
  registerShutdownTask(() => {
    stopWindowsSpeech()
  })
  registerShutdownTask(async () => {
    await vaultApiServer.stop()
  })
  registerShutdownTask(() => {
    closeFileWatcher()
  })
  registerShutdownTask(() => {
    if (!app.isPackaged) {
      killSiblingDevProcesses(appRoot, process.pid)
    }
  })
  registerShutdownTask(() => {
    const stats = killAllSessionChildProcesses(appRoot, process.pid)
    if (stats.tracked + stats.descendants + stats.orphans > 0) {
      console.log(
        `[Shutdown] Child process cleanup: tracked=${stats.tracked} descendants=${stats.descendants} orphans=${stats.orphans}`,
      )
    }
  })
  registerShutdownTask(() => {
    closeDatabase()
  })
}

/** Keep window foreground through full startup splash (~5.5s). */
const STARTUP_FOREGROUND_MS = 6_000

let foregroundTimer: ReturnType<typeof setTimeout> | null = null

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true)
    if (foregroundTimer) clearTimeout(foregroundTimer)
    foregroundTimer = setTimeout(() => {
      foregroundTimer = null
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false)
    }, STARTUP_FOREGROUND_MS)
  }
  mainWindow.focus()
  void app.focus()
}

function resolveWindowBackgroundColor(): string {
  const settings = readAppSettings()
  const palette = settings.lightPalette === 'cold' ? 'cold' : 'paper'
  const lightBg = palette === 'cold' ? '#fafaf9' : '#f0eeea'
  const theme = settings.theme || 'dark'
  if (theme === 'light') return lightBg
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? '#18181b' : lightBg
  }
  return '#18181b'
}

const DEV_RENDERER_URL = 'http://127.0.0.1:3000/'

type LoadErrorLocale = 'zh' | 'en'

function resolveLoadErrorLocale(): LoadErrorLocale {
  const settings = readAppSettings()
  const lang = typeof settings.language === 'string' ? settings.language.toLowerCase() : ''
  if (lang.startsWith('en')) return 'en'
  if (lang.startsWith('zh')) return 'zh'
  const sys = app.getLocale().toLowerCase()
  return sys.startsWith('zh') ? 'zh' : 'en'
}

const LOAD_ERROR_COPY: Record<
  LoadErrorLocale,
  {
    devTitle: string
    devDetail: string
    devHint: string
    missingBuildTitle: string
    missingBuildDetail: (path: string) => string
    missingBuildHint: string
    loadFailedTitle: string
    loadFailedHint: string
    didFailHint: string
  }
> = {
  zh: {
    devTitle: '界面加载失败',
    devDetail: '无法连接开发服务器 http://127.0.0.1:3000 。请完全退出 MetaMates 后，在 metamates-app 目录运行 npm run start。',
    devHint: '不要单独运行 electron . — 需要 Vite 与 Electron 同时启动。',
    missingBuildTitle: '缺少前端构建产物',
    missingBuildDetail: (p) => `未找到 ${p}`,
    missingBuildHint: '请在 metamates-app 目录执行 npm run build，或使用 npm run electron:build:win 重新打包。',
    loadFailedTitle: '界面加载失败',
    loadFailedHint: '请重新安装 MetaMates，或在 metamates-app 目录执行 npm run build 后重试。',
    didFailHint: '请完全退出 MetaMates 后重新打开；开发环境请运行 npm run start。',
  },
  en: {
    devTitle: 'UI failed to load',
    devDetail: 'Could not connect to the dev server at http://127.0.0.1:3000. Quit MetaMates completely, then run npm run start from metamates-app.',
    devHint: 'Do not run electron . alone — Vite and Electron must start together.',
    missingBuildTitle: 'Missing frontend build',
    missingBuildDetail: (p) => `Not found: ${p}`,
    missingBuildHint: 'Run npm run build in metamates-app, or repackage with npm run electron:build:win.',
    loadFailedTitle: 'UI failed to load',
    loadFailedHint: 'Reinstall MetaMates, or run npm run build in metamates-app and try again.',
    didFailHint: 'Quit MetaMates completely and reopen; for dev use npm run start.',
  },
}

/**
 * Inline HTML shown when the renderer fails to load (avoids blank white window).
 */
function buildLoadErrorHtml(title: string, detail: string, hint: string, locale: LoadErrorLocale): string {
  const safe = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><title>${safe(title)}</title>
<style>
  body{margin:0;font-family:"Segoe UI","PingFang SC",sans-serif;background:#18181b;color:#fafafa;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px;}
  .box{max-width:520px;line-height:1.6}
  h1{font-size:20px;margin:0 0 12px;color:#ff8c28}
  p{margin:0 0 12px;color:#d4d4d8}
  code{background:#28282e;padding:2px 6px;border-radius:4px;font-size:13px}
  .hint{margin-top:20px;padding:12px 14px;border-left:3px solid #00d4c4;background:rgba(0,212,196,.08);color:#a1a1aa;font-size:13px}
</style></head><body><div class="box">
<h1>${safe(title)}</h1>
<p>${safe(detail)}</p>
<div class="hint">${safe(hint)}</div>
</div></body></html>`
}

/**
 * @param win - Target browser window
 * @param isDev - Whether running unpackaged dev build
 */
function loadRenderer(win: BrowserWindow, isDev: boolean): void {
  const locale = resolveLoadErrorLocale()
  const copy = LOAD_ERROR_COPY[locale]
  if (isDev) {
    win.loadURL(DEV_RENDERER_URL).catch((err: Error) => {
      console.error('[MAIN] Dev renderer load failed:', err.message)
      void win.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            buildLoadErrorHtml(copy.devTitle, copy.devDetail, copy.devHint, locale),
          ),
      )
    })
    return
  }

  const indexPath = path.join(__dirname, '../dist/index.html')
  if (!fs.existsSync(indexPath)) {
    console.error('[MAIN] Production index missing:', indexPath)
    void win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          buildLoadErrorHtml(
            copy.missingBuildTitle,
            copy.missingBuildDetail(indexPath),
            copy.missingBuildHint,
            locale,
          ),
        ),
    )
    return
  }

  loadPackagedRenderer(win, indexPath, locale)
}

function loadPackagedRenderer(win: BrowserWindow, indexPath: string, locale: LoadErrorLocale): void {
  const copy = LOAD_ERROR_COPY[locale]
  void win.loadFile(indexPath).catch((err: Error) => {
    console.error('[MAIN] Production renderer load failed:', err.message)
    void win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          buildLoadErrorHtml(copy.loadFailedTitle, err.message, copy.loadFailedHint, locale),
        ),
    )
  })
}

function createWindow() {
  // Packaged builds must always load dist/ — ignore NODE_ENV=development in the shell.
  const isDev = !app.isPackaged
  const preferredIcon = isDev
    ? path.join(__dirname, '../build/icon.ico')
    : resolveBuildIconPath(process.platform === 'darwin' ? 'icon.icns' : 'icon.ico')
  const fallbackIcon = isDev
    ? path.join(__dirname, '../build/icon.ico')
    : resolveBuildIconPath('icon.ico')
  const resolvedIconPath = fs.existsSync(preferredIcon) ? preferredIcon : fallbackIcon

  console.log('[MAIN] Icon path:', resolvedIconPath, 'exists:', fs.existsSync(resolvedIconPath))

  let icon: NativeImage | undefined
  try {
    if (fs.existsSync(resolvedIconPath)) {
      icon = nativeImage.createFromPath(resolvedIconPath)
      console.log('[MAIN] Icon loaded, size:', icon.getSize())
    }
  } catch (err) {
    console.error('[MAIN] Failed to load icon:', err)
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: 'hidden',
    icon: icon,
    backgroundColor: resolveWindowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    // Packaged: show immediately — inline #boot-splash in index.html paints before JS bundle.
    show: true,
  })

  setAcpMainWindow(mainWindow)

  // Foreground immediately — dev launches from terminal/IDE otherwise miss the splash.
  focusMainWindow()

  loadRenderer(mainWindow, isDev)

  mainWindow.webContents.once('dom-ready', () => {
    if (!isDev) markBootSplashAnchor()
    focusMainWindow()
    if (!isDev) console.log('[MAIN] Boot splash DOM ready')
  })
  // Safety: never leave the user staring at a hidden window if dom-ready is slow.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[MAIN] Force-showing window after 400ms (dom-ready slow)')
      focusMainWindow()
    }
  }, 400)

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL.startsWith('data:text/html')) return
    console.error('[MAIN] did-fail-load:', errorCode, errorDescription, validatedURL)
    if (!mainWindow || mainWindow.isDestroyed()) return
    const locale = resolveLoadErrorLocale()
    const copy = LOAD_ERROR_COPY[locale]
    void mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          buildLoadErrorHtml(
            copy.loadFailedTitle,
            `${errorDescription} (${errorCode}) — ${validatedURL}`,
            copy.didFailHint,
            locale,
          ),
        ),
    )
  })

  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow?.webContents.getURL() ?? ''
    if (url.startsWith('data:text/html')) return
    if (isDev) focusMainWindow()
    console.log('[MAIN] Renderer loaded, electronAPI exposed:', !!mainWindow?.webContents.getURL())
    // Defer agent warmup until after first shell paint.
    setTimeout(() => void startAcpStartupWarmup(), 1_500)
  })

  mainWindow.once('ready-to-show', () => {
    focusMainWindow()
    console.log('[MAIN] MetaMates desktop window visible — use this window, not a browser tab')
  })

  mainWindow.on('closed', () => {
    appendSessionLifecycleEvent('main_window_closed')
    mainWindow = null
  })
}

/** Recover when the process is alive but no visible window (zombie shell on Windows). */
function scheduleWindowWatchdog(): void {
  if (process.env.METAMATES_E2E === '1') return
  setTimeout(() => {
    const win = mainWindow
    if (!win || win.isDestroyed()) {
      console.warn('[MAIN] Window watchdog: recreating missing window')
      appendSessionLifecycleEvent('window_watchdog_recreate')
      createWindow()
      return
    }
    if (!win.isVisible() && !win.isMinimized()) {
      console.warn('[MAIN] Window watchdog: forcing show on hidden window')
      appendSessionLifecycleEvent('window_watchdog_force_show')
      focusMainWindow()
    }
  }, 15_000)
}

function ensureMainWindowFocused(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  focusMainWindow()
}

app.whenReady().then(async () => {
  createWindow()
  scheduleWindowWatchdog()

  registerAppShutdownHooks()

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || (permission as string) === 'audioCapture')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || (permission as string) === 'audioCapture'
  })

  setTimeout(() => {
    registerSpeechHandlers(() => mainWindow)
    registerNativeThemeBridge()
    registerDocumentExtractHandlers()
    registerPluginHandlers()
  }, 0)

  if (app.isPackaged && process.env.METAMATES_E2E !== '1') {
    setTimeout(() => killStaleMetaMatesProcesses(appRoot, process.pid), 8_000)
  }

  setTimeout(() => warmupDatabase(), 0)

  void (async () => {
    try {
      // Wait for boot splash paint, then run DB/ACP init off the critical path.
      await new Promise<void>((resolve) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          resolve()
          return
        }
        if (mainWindow.webContents.isLoading()) {
          mainWindow.webContents.once('dom-ready', () => resolve())
        } else {
          resolve()
        }
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
      await sessionStore.load()
      await registerAcpIpcHandlers()
      registerUpdaterHandlers(() => mainWindow)
      markDesktopReady()
      if (app.isPackaged && (process.env.METAMATES_E2E !== '1' || process.env.METAMATES_E2E_ALLOW_BUNDLED_PLUGINS === '1')) {
        void ensureBundledPluginsInstalled()
      }
    } catch (err) {
      console.error('[MAIN] Post-window init failed:', err)
      markDesktopReady()
      if (app.isPackaged && (process.env.METAMATES_E2E !== '1' || process.env.METAMATES_E2E_ALLOW_BUNDLED_PLUGINS === '1')) {
        void ensureBundledPluginsInstalled()
      }
    }
  })()

  app.on('second-instance', () => {
    appendSessionLifecycleEvent('second_instance')
    ensureMainWindowFocused()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      ensureMainWindowFocused()
    }
  })
})

app.on('before-quit', (event) => {
  if (quitAfterShutdown || isImmediateQuitAllowed()) return
  appendSessionLifecycleEvent('before_quit')
  event.preventDefault()
  registerAppShutdownHooks()
  const forceQuitTimer = setTimeout(() => {
    console.warn('[MAIN] Shutdown timed out; forcing quit')
    appendSessionLifecycleEvent('shutdown_timeout')
    quitAfterShutdown = true
    app.quit()
  }, 15_000)
  void runAppShutdown().finally(() => {
    clearTimeout(forceQuitTimer)
    quitAfterShutdown = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  appendSessionLifecycleEvent('window_all_closed')
  app.quit()
})

ipcMain.handle('wait-desktop-ready', async () => {
  await desktopReadyPromise
  return { ready: true }
})

ipcMain.handle('get-boot-elapsed-ms', () => getBootElapsedMs())

/** 同步主进程工作区根路径（文件 IPC 沙箱依赖；不触发 Agent 重连） */
ipcMain.handle('sync-workspace-path', async (_event, workspacePath: string) => {
  if (!workspacePath?.trim()) {
    setCurrentWorkspacePath('')
    return { success: true }
  }
  setCurrentWorkspacePath(path.resolve(workspacePath))
  return { success: true }
})

ipcMain.handle('read-file', async (event, filePath: string) => {
  try {
    const guard = assertWithinWorkspace(getCurrentWorkspacePath(), filePath)
    const pathError = pathAssertError(guard)
    if (pathError) return { success: false, error: pathError }
    const resolved = pathAssertResolved(guard)!
    if (fs.statSync(resolved).isDirectory()) {
      return { success: false, error: 'EISDIR: illegal operation on a directory, read' }
    }
    const content = fs.readFileSync(resolved, 'utf-8')
    return { success: true, content }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
  try {
    const guard = assertWithinWorkspace(getCurrentWorkspacePath(), filePath)
    const pathError = pathAssertError(guard)
    if (pathError) return { success: false, error: pathError }
    const resolved = pathAssertResolved(guard)!
    const buffer = fs.readFileSync(resolved)
    return { success: true, data: buffer.toString('base64'), mimeType: getMimeTypeFromPath(resolved) }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('write-file', async (event, filePath: string, content: string) => {
  try {
    const guard = assertWithinWorkspace(getCurrentWorkspacePath(), filePath)
    const pathError = pathAssertError(guard)
    if (pathError) return { success: false, error: pathError }
    const resolved = pathAssertResolved(guard)!
    const dir = path.dirname(resolved)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(resolved, content, 'utf-8')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('list-files', async (event, dirPath: string, recursive: boolean = false) => {
  try {
    const scoped = resolveWorkspacePath(dirPath)
    const listError = pathAssertError(scoped)
    if (listError) return { success: false, error: listError }
    dirPath = pathAssertResolved(scoped)!

    const files: any[] = []
    
    const scanDir = (dir: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          files.push({
            name: item.name,
            isDirectory: true,
            path: fullPath,
          })
          if (recursive) {
            scanDir(fullPath)
          }
          continue
        }
        let modified: number | undefined
        try {
          modified = fs.statSync(fullPath).mtime.getTime()
        } catch {
          /* ignore stat errors */
        }
        files.push({
          name: item.name,
          isDirectory: false,
          path: fullPath,
          modified,
        })
      }
    }
    
    scanDir(dirPath)
    return { success: true, files }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('delete-file', async (event, filePath: string) => {
  try {
    const guard = assertWithinWorkspace(getCurrentWorkspacePath(), filePath)
    const pathError = pathAssertError(guard)
    if (pathError) return { success: false, error: pathError }
    const resolved = pathAssertResolved(guard)!
    if (!fs.existsSync(resolved)) {
      return { success: true, alreadyGone: true }
    }
    if (fs.statSync(resolved).isDirectory()) {
      fs.rmSync(resolved, { recursive: true })
    } else {
      fs.unlinkSync(resolved)
    }
    return { success: true }
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { success: true, alreadyGone: true }
    }
    return { success: false, error: error.message }
  }
})

ipcMain.handle('select-directory', async () => {
  const parent = getDialogParentWindow()
  const result = await dialog.showOpenDialog(parent ?? undefined, {
    properties: ['openDirectory'],
  })
  return { canceled: result.canceled, filePaths: result.filePaths }
})

ipcMain.handle('get-settings', async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json')
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('[MAIN] Failed to read settings:', error)
  }
  return null
})

ipcMain.handle('save-settings', async (_event, settings: any) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json')
  try {
    let existingSettings: any = {}
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      existingSettings = JSON.parse(data)
    }
    const mergedSettings = { ...existingSettings, ...settings }
    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf-8')
    console.log('[MAIN] Settings saved:', settings)

    if (settings?.theme === 'light' || settings?.theme === 'dark' || settings?.theme === 'system') {
      syncNativeThemeSource(settings.theme)
    }

    if (settings?.cliAgentEnabled && typeof settings.cliAgentEnabled === 'object') {
      try {
        syncCliAgentEnabledPreferences(
          settings.cliAgentEnabled as Record<string, boolean>,
          existingSettings.cliAgentEnabled as Record<string, boolean> | undefined,
        )
      } catch (syncError) {
        console.error('[MAIN] Failed to sync CLI agent preferences:', syncError)
      }
    }

    return { success: true }
  } catch (error) {
    console.error('[MAIN] Failed to save settings:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('select-file', async (_event, filters?: { name: string; extensions: string[] }[]) => {
  const parent = getDialogParentWindow()
  const result = await dialog.showOpenDialog(parent ?? undefined, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return { canceled: result.canceled, filePath: result.filePaths[0] }
})

ipcMain.handle('save-file-dialog', async () => {
  const parent = getDialogParentWindow()
  const result = await dialog.showSaveDialog(parent ?? undefined, {
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return { canceled: result.canceled, filePath: result.filePath }
})

ipcMain.handle('file-exists', async (event, filePath: string) => {
  const workspace = getCurrentWorkspacePath()
  if (!workspace) {
    // Startup restore path check runs before workspace is bound.
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      return { exists: false, error: 'No workspace selected' }
    }
    return { exists: fs.existsSync(filePath) }
  }
  const scoped = resolveWorkspacePath(filePath)
  const existsError = pathAssertError(scoped)
  if (existsError) return { exists: false, error: existsError }
  return { exists: fs.existsSync(pathAssertResolved(scoped)!) }
})

ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { success: false, error: 'Invalid URL' }
  }
  await shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('open-user-manual', async () => {
  const manualPath = resolveUserManualPath()
  if (!manualPath) {
    return { success: false, error: 'User manual not found' }
  }
  const openError = await shell.openPath(manualPath)
  if (openError) {
    return { success: false, error: openError }
  }
  return { success: true }
})

ipcMain.handle('create-directory', async (event, dirPath: string) => {
  try {
    const scoped = resolveWorkspacePath(dirPath)
    const dirError = pathAssertError(scoped)
    if (dirError) return { success: false, error: dirError }
    fs.mkdirSync(pathAssertResolved(scoped)!, { recursive: true })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-file-stats', async (event, filePath: string) => {
  try {
    const scoped = resolveWorkspacePath(filePath)
    const statsError = pathAssertError(scoped)
    if (statsError) return { success: false, error: statsError }
    const stats = fs.statSync(pathAssertResolved(scoped)!)
    return { success: true, stats: { size: stats.size, modified: stats.mtime.getTime() } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('rename-file', async (event, oldPath: string, newPath: string) => {
  try {
    const oldScoped = resolveWorkspacePath(oldPath)
    const oldError = pathAssertError(oldScoped)
    if (oldError) return { success: false, error: oldError }
    const newScoped = resolveWorkspacePath(newPath)
    const newError = pathAssertError(newScoped)
    if (newError) return { success: false, error: newError }
    fs.renameSync(pathAssertResolved(oldScoped)!, pathAssertResolved(newScoped)!)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('watch-directory', async (event, dirPath: string) => {
  if (currentWatcher) {
    currentWatcher.close()
  }

  const scoped = resolveWorkspacePath(dirPath)
  const watchError = pathAssertError(scoped)
  if (watchError) return { success: false, error: watchError }
  dirPath = pathAssertResolved(scoped)!
  
  try {
    currentWatcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (mainWindow && !mainWindow.isDestroyed() && filename) {
        mainWindow.webContents.send('file-changed', {
          type: eventType,
          filename,
          dirPath,
        })
      }
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('unwatch-directory', async () => {
  if (currentWatcher) {
    currentWatcher.close()
    currentWatcher = null
  }
  return { success: true }
})

ipcMain.handle('open-in-explorer', async (event, filePath: string) => {
  const scoped = resolveWorkspacePath(filePath)
  const explorerError = pathAssertError(scoped)
  if (explorerError) return { success: false, error: explorerError }
  shell.showItemInFolder(pathAssertResolved(scoped)!)
  return { success: true }
})

ipcMain.handle('window-minimize', async () => {
  mainWindow?.minimize()
  return { success: true }
})

ipcMain.handle('window-maximize', async () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
  return { success: true }
})

ipcMain.handle('window-close', async () => {
  mainWindow?.close()
  return { success: true }
})

ipcMain.handle('window-is-maximized', async () => {
  return mainWindow?.isMaximized() || false
})

ipcMain.handle('path-basename', async (event, filePath: string) => {
  return path.basename(filePath)
})

ipcMain.handle('path-join', async (event, paths: string[]) => {
  return path.join(...paths)
})

ipcMain.handle('path-dirname', async (event, filePath: string) => {
  return path.dirname(filePath)
})

ipcMain.handle('path-resolve', async (event, paths: string[]) => {
  return path.resolve(...paths)
})

ipcMain.handle('path-relative', async (_event, from: string, to: string) => {
  return path.relative(from, to)
})

ipcMain.handle('read-text-file', async (_event, filePath: string) => {
  try {
    const scoped = resolveWorkspacePath(filePath)
    const readError = pathAssertError(scoped)
    if (readError) throw new Error(readError)
    return fs.readFileSync(pathAssertResolved(scoped)!, 'utf-8')
  } catch (error: any) {
    throw new Error(error?.message || 'read-text-file failed')
  }
})

ipcMain.handle('write-text-file', async (_event, filePath: string, content: string) => {
  try {
    const scoped = resolveWorkspacePath(filePath)
    const writeError = pathAssertError(scoped)
    if (writeError) throw new Error(writeError)
    fs.writeFileSync(pathAssertResolved(scoped)!, content, 'utf-8')
  } catch (error: any) {
    throw new Error(error?.message || 'write-text-file failed')
  }
})

ipcMain.handle('init-workspace', async (event, workspacePath: string, language: string = 'zh') => {
  try {
    setCurrentWorkspacePath(path.resolve(workspacePath))
    const items = fs.readdirSync(workspacePath, { withFileTypes: true })
    const hasMetaMatesStructure = items.some(item => 
      item.isDirectory() && (
        item.name.startsWith('01_') || 
        item.name.startsWith('02_') || 
        item.name.startsWith('03_') ||
        item.name.startsWith('04_') ||
        item.name.startsWith('05_')
      )
    )
    
    if (hasMetaMatesStructure) {
      const lang = (language === 'en' ? 'en' : 'zh') as IntelLanguage
      ensureIntelligenceMemoryLayout(workspacePath, lang)
      return { success: true, initialized: false, reason: 'Workspace already has MetaMates structure' }
    }
    
    const baseInitsPath = resolveInitsRoot()
    
    const langDir = language === 'en' ? 'en' : 'zh'
    const initsPath = path.join(baseInitsPath, langDir)
    
    if (!fs.existsSync(initsPath)) {
      return { success: false, error: `Inits directory not found for language: ${language}`, initialized: false }
    }
    
    const initFolders = fs.readdirSync(initsPath, { withFileTypes: true })
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
    
    const createdFolders: string[] = []
    for (const folder of initFolders) {
      const srcPath = path.join(initsPath, folder.name)
      const destPath = path.join(workspacePath, folder.name)
      
      if (!fs.existsSync(destPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true })
        createdFolders.push(folder.name)
      }
    }
    
    const initFiles = fs.readdirSync(initsPath, { withFileTypes: true })
      .filter(item => item.isFile())
    
    const createdFiles: string[] = []
    for (const file of initFiles) {
      const srcPath = path.join(initsPath, file.name)
      const destPath = path.join(workspacePath, file.name)
      
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
        createdFiles.push(file.name)
      }
    }

    const lang = (language === 'en' ? 'en' : 'zh') as IntelLanguage
    const intel = ensureIntelligenceMemoryLayout(workspacePath, lang)
    if (intel.created.length > 0) {
      createdFiles.push(...intel.created)
    }

    return { success: true, initialized: true, foldersCreated: createdFolders, filesCreated: createdFiles }
  } catch (error: any) {
    return { success: false, error: error.message, initialized: false }
  }
})

ipcMain.handle('reinit-workspace', async (event, workspacePath: string, language: string = 'zh') => {
  try {
    const baseInitsPath = resolveInitsRoot()
    
    const langDir = language === 'en' ? 'en' : 'zh'
    const initsPath = path.join(baseInitsPath, langDir)
    
    if (!fs.existsSync(initsPath)) {
      return { success: false, error: `Inits directory not found for language: ${language}` }
    }

    const createdItems: string[] = []
    const skippedItems: string[] = []

    function syncDir(srcDir: string, destDir: string, relativePath: string = '') {
      const items = fs.readdirSync(srcDir, { withFileTypes: true })
      
      for (const item of items) {
        const srcItemPath = path.join(srcDir, item.name)
        const destItemPath = path.join(destDir, item.name)
        const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name
        
        if (item.isDirectory()) {
          if (!fs.existsSync(destItemPath)) {
            fs.mkdirSync(destItemPath, { recursive: true })
          }
          syncDir(srcItemPath, destItemPath, itemRelativePath)
        } else {
          if (!fs.existsSync(destItemPath)) {
            fs.copyFileSync(srcItemPath, destItemPath)
            createdItems.push(itemRelativePath)
          } else {
            skippedItems.push(itemRelativePath)
          }
        }
      }
    }
    
    const initFolders = fs.readdirSync(initsPath, { withFileTypes: true })
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
    
    for (const folder of initFolders) {
      const srcPath = path.join(initsPath, folder.name)
      const destPath = path.join(workspacePath, folder.name)
      
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true })
      }
      syncDir(srcPath, destPath, folder.name)
    }
    
    const initFiles = fs.readdirSync(initsPath, { withFileTypes: true })
      .filter(item => item.isFile())
    
    for (const file of initFiles) {
      const srcPath = path.join(initsPath, file.name)
      const destPath = path.join(workspacePath, file.name)
      
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
        createdItems.push(file.name)
      } else {
        skippedItems.push(file.name)
      }
    }

    const message = language === 'en' 
      ? `Synced ${createdItems.length} items, skipped ${skippedItems.length} existing` 
      : `已同步 ${createdItems.length} 项，跳过 ${skippedItems.length} 个已存在`

    const lang = (language === 'en' ? 'en' : 'zh') as IntelLanguage
    const intel = ensureIntelligenceMemoryLayout(workspacePath, lang)
    if (intel.created.length > 0) {
      createdItems.push(...intel.created)
    }

    return { success: true, createdItems, message, intelligenceProvisioned: intel.created }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('detect-legacy-paths', async (_event, workspacePath: string, language: string = 'zh') => {
  try {
    const lang = language === 'en' ? 'en' : 'zh'
    const legacy = detectLegacyPaths(workspacePath, lang)
    return { success: true, legacy, needsMigration: legacy.length > 0 }
  } catch (error: any) {
    return { success: false, error: error.message, legacy: [], needsMigration: false }
  }
})

ipcMain.handle('migrate-workspace', async (_event, workspacePath: string, language: string = 'zh') => {
  try {
    const lang = language === 'en' ? 'en' : 'zh'
    return migrateWorkspace(workspacePath, lang)
  } catch (error: any) {
    return { success: false, migrated: [], skipped: [], error: error.message }
  }
})

ipcMain.handle('vault-api-start', async (
  _event,
  workspacePath: string,
  port?: number,
  calendarIcsPath?: string,
  bindLan?: boolean
) => {
  try {
    const settings = readAppSettings()
    const resolvedPort = port || (settings.vaultApiPort as number) || 17333
    const useLan = bindLan ?? !!settings.vaultApiLanAccess

    if (useLan) {
      const fw = await ensureWindowsFirewallRule(resolvedPort)
      if (!fw.ok && !fw.skipped) {
        console.warn('[VaultAPI] Firewall rule not added:', fw.error)
      }
    }

    return await vaultApiServer.start(workspacePath, resolvedPort, {
      calendarIcsPath,
      bindLan: useLan,
    })
  } catch (error: any) {
    return { success: false, port: port || 17333, error: error.message }
  }
})

ipcMain.handle('get-calendar-events', async (_event, workspacePath: string, icsPath?: string, dateIso?: string) => {
  try {
    const date = dateIso ? new Date(dateIso) : undefined
    return {
      success: true,
      ...getCalendarSummary(workspacePath, icsPath, date),
    }
  } catch (error: any) {
    return { success: false, events: [], source: null, date: '', error: error.message }
  }
})

ipcMain.handle('pick-calendar-file', async () => {
  const parent = getDialogParentWindow()
  const result = await dialog.showOpenDialog(parent ?? undefined, {
    properties: ['openFile'],
    filters: [
      { name: 'iCalendar', extensions: ['ics'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return { canceled: result.canceled, filePath: result.filePaths[0] }
})

ipcMain.handle('ollama-status', async (_event, baseUrl?: string) => {
  const settings = readAppSettings()
  const url = baseUrl || (settings.ollamaBaseUrl as string) || 'http://127.0.0.1:11434'
  return getOllamaStatus(url)
})

ipcMain.handle('vault-api-stop', async () => {
  await vaultApiServer.stop()
  return { success: true }
})

ipcMain.handle('vault-api-status', async () => {
  return vaultApiServer.getStatus()
})

ipcMain.handle('get-database-status', async () => {
  return { available: sessionDb.isDatabaseAvailable() }
})

ipcMain.handle('get-lan-addresses', async () => {
  return { addresses: getLanIPv4Addresses() }
})
