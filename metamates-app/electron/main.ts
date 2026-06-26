import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, session } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { FSWatcher } from 'fs'
import type { NativeImage } from 'electron'
import { registerAcpIpcHandlers, setAcpMainWindow, startAcpStartupWarmup, syncCliAgentEnabledPreferences } from './acp/ipcHandlers'
import { sessionStore } from './acp/sessionStore'
import { closeDatabase, warmupDatabase } from './acp/sessionDb'
import { migrateWorkspace, detectLegacyPaths } from './workspaceMigrate'
import { vaultApiServer } from './vaultApi/server'
import { getCalendarSummary } from './calendar/index'
import { readAppSettings } from './appSettings'
import { getOllamaStatus } from './ollama/client'
import { detectWorkspaceLanguage } from './workspaceLayout'
import { assertWithinWorkspace, pathAssertError, pathAssertResolved } from './shared/pathSafety'
import { getCurrentWorkspacePath, setCurrentWorkspacePath } from './shared/workspaceState'
import { registerDocumentExtractHandlers } from './documentExtract/ipcHandlers'
import { registerSpeechHandlers } from './speech/ipcHandlers'
import { getMimeTypeFromPath } from './documentExtract/mimeType'
import { getLanIPv4Addresses } from './shared/lanAddresses'
import { ensureWindowsFirewallRule } from './vaultApi/firewall'
import { ensureIntelligenceMemoryLayout, type WorkspaceLanguage as IntelLanguage } from './shared/intelligencePaths'

const pty = require('node-pty')

type IPty = ReturnType<typeof pty.spawn>

let mainWindow: BrowserWindow | null = null
let currentWatcher: FSWatcher | null = null
let activeTerminals: Map<number, IPty> = new Map()

const skipSingleInstanceLock = process.env.METAMATES_E2E === '1'
const gotSingleInstanceLock = skipSingleInstanceLock || app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true)
    setTimeout(() => mainWindow?.setAlwaysOnTop(false), 2500)
  }
}

const DEV_RENDERER_URL = 'http://127.0.0.1:3000/'

/**
 * Inline HTML shown when the renderer fails to load (avoids blank white window).
 */
function buildLoadErrorHtml(title: string, detail: string, hint: string): string {
  const safe = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>${safe(title)}</title>
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
  if (isDev) {
    win.loadURL(DEV_RENDERER_URL).catch((err: Error) => {
      console.error('[MAIN] Dev renderer load failed:', err.message)
      void win.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            buildLoadErrorHtml(
              '界面加载失败',
              '无法连接开发服务器 http://127.0.0.1:3000 。请完全退出 Metamates 后，在 metamates-app 目录运行 npm run start。',
              '不要单独运行 electron . — 需要 Vite 与 Electron 同时启动。',
            ),
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
            '缺少前端构建产物',
            `未找到 ${indexPath}`,
            '请在 metamates-app 目录执行 npm run build，或使用 npm run electron:build:win 重新打包。',
          ),
        ),
    )
    return
  }

  win.loadFile(indexPath).catch((err: Error) => {
    console.error('[MAIN] Production renderer load failed:', err.message)
  })
}

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  let iconPath: string
  
  if (isDev) {
    iconPath = path.join(__dirname, '../build/icon.ico')
  } else {
    iconPath = path.join(process.resourcesPath, 'build/icon.ico')
  }
  
  console.log('[MAIN] Icon path:', iconPath, 'exists:', fs.existsSync(iconPath))
  
  let icon: NativeImage | undefined
  try {
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath)
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  setAcpMainWindow(mainWindow)

  loadRenderer(mainWindow, isDev)

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL.startsWith('data:text/html')) return
    console.error('[MAIN] did-fail-load:', errorCode, errorDescription, validatedURL)
    if (!mainWindow || mainWindow.isDestroyed()) return
    const hint = isDev
      ? '请确认 metamates-app 下 Vite 已启动（npm run start），且 3000 端口未被占用。'
      : '请重新执行 npm run build 后再启动应用。'
    void mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          buildLoadErrorHtml(
            'Metamates 界面未能加载',
            `${errorDescription} (${errorCode}) — ${validatedURL}`,
            hint,
          ),
        ),
    )
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] Renderer loaded, electronAPI exposed:', !!mainWindow?.webContents.getURL())
    void startAcpStartupWarmup()
  })

  mainWindow.once('ready-to-show', () => {
    focusMainWindow()
    console.log('[MAIN] Metamates desktop window visible — use this window, not a browser tab')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || (permission as string) === 'audioCapture')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || (permission as string) === 'audioCapture'
  })

  registerSpeechHandlers(() => mainWindow)

  warmupDatabase()
  registerDocumentExtractHandlers()

  await sessionStore.load()
  await registerAcpIpcHandlers()

  createWindow()

  app.on('second-instance', () => {
    focusMainWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      focusMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  for (const [, term] of activeTerminals) {
    term.kill()
  }
  activeTerminals.clear()
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

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
    const files: any[] = []
    
    const scanDir = (dir: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        files.push({
          name: item.name,
          isDirectory: item.isDirectory(),
          path: fullPath,
        })
        if (item.isDirectory() && recursive) {
          scanDir(fullPath)
        }
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
    if (fs.statSync(resolved).isDirectory()) {
      fs.rmSync(resolved, { recursive: true })
    } else {
      fs.unlinkSync(resolved)
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
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
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return { canceled: result.canceled, filePath: result.filePaths[0] }
})

ipcMain.handle('save-file-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return { canceled: result.canceled, filePath: result.filePath }
})

ipcMain.handle('file-exists', async (event, filePath: string) => {
  return { exists: fs.existsSync(filePath) }
})

ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { success: false, error: 'Invalid URL' }
  }
  await shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('create-directory', async (event, dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-file-stats', async (event, filePath: string) => {
  try {
    const stats = fs.statSync(filePath)
    return { success: true, stats: { size: stats.size, modified: stats.mtime.getTime() } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('rename-file', async (event, oldPath: string, newPath: string) => {
  try {
    fs.renameSync(oldPath, newPath)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('watch-directory', async (event, dirPath: string) => {
  if (currentWatcher) {
    currentWatcher.close()
  }
  
  try {
    currentWatcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (mainWindow && filename) {
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
  shell.showItemInFolder(filePath)
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
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('write-text-file', async (_event, filePath: string, content: string) => {
  fs.writeFileSync(filePath, content, 'utf-8')
})

ipcMain.handle('terminal-start', async (event, cwd?: string) => {
  console.log('[Terminal] Starting terminal with cwd:', cwd)
  
  try {
    const isWindows = process.platform === 'win32'
    const shell = 'cmd.exe'
    const args = ['/c', 'chcp 65001 >nul 2>&1 && powershell.exe -NoLogo']
    const workingDir = cwd || process.cwd()
    
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      WT_SESSION: '1',
    }
    
    const term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: env,
      useConpty: true,
      useConptyDll: true,
    })

    console.log('[Terminal] Spawned terminal with pid:', term.pid)

    activeTerminals.set(term.pid, term)

    term.onData((data: string) => {
      console.log('[Terminal] onData:', data.length, 'bytes')
      mainWindow?.webContents.send('terminal-output', {
        type: 'data',
        data,
        pid: term.pid,
      })
    })

    term.onExit(({ exitCode }) => {
      console.log('[Terminal] onExit:', exitCode)
      mainWindow?.webContents.send('terminal-output', {
        type: 'exit',
        data: `\r\n[Exit code: ${exitCode}]\r\n`,
        pid: term.pid,
      })
      activeTerminals.delete(term.pid)
    })

    return { success: true, pid: term.pid }
  } catch (error: any) {
    console.error('[Terminal] Error:', error)
    return { 
      success: false, 
      error: error.message,
      errorType: error.code || 'UNKNOWN',
      errorName: error.name || 'TerminalError'
    }
  }
})

ipcMain.handle('terminal-input', async (event, pid: number, data: string) => {
  const term = activeTerminals.get(pid)
  if (!term) {
    return { success: false, error: 'Terminal not found' }
  }
  
  try {
    term.write(data)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('terminal-resize', async (event, pid: number, cols: number, rows: number) => {
  const term = activeTerminals.get(pid)
  if (!term) {
    return { success: false, error: 'Terminal not found' }
  }
  
  try {
    term.resize(cols, rows)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('terminal-kill', async (event, pid: number) => {
  const term = activeTerminals.get(pid)
  if (term) {
    try {
      term.kill()
      activeTerminals.delete(pid)
      return { success: true }
    } catch (error: any) {
      console.error('[Terminal] Error killing terminal:', error)
      return { success: false, error: error.message }
    }
  }
  return { success: false, error: 'Terminal not found' }
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
    
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
    let baseInitsPath: string
    
    if (isDev) {
      baseInitsPath = path.join(__dirname, '..', 'inits')
    } else {
      baseInitsPath = path.join(process.resourcesPath, 'inits')
    }
    
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
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
    let baseInitsPath: string
    
    if (isDev) {
      baseInitsPath = path.join(__dirname, '..', 'inits')
    } else {
      baseInitsPath = path.join(process.resourcesPath, 'inits')
    }
    
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
  const result = await dialog.showOpenDialog(mainWindow!, {
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

ipcMain.handle('get-lan-addresses', async () => {
  return { addresses: getLanIPv4Addresses() }
})
