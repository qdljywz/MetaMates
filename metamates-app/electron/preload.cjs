const { contextBridge, ipcRenderer, clipboard } = require('electron')

let simulateVoiceTranscriptFn = null
let simulateGraduateArchiveFn = null
let simulateSlashWritebackOpenFn = null
let setAutoSaveFn = null
let simulateExternalFileRemovedFn = null
/** @type {Array<{ canceled: boolean, filePaths: string[] }>} */
let mockSelectDirectoryQueue = []

contextBridge.exposeInMainWorld('__METAMATES_E2E__', {
  enabled: process.env.METAMATES_E2E === '1',
  workspace: process.env.METAMATES_WORKSPACE || '',
  noAgents: process.env.METAMATES_E2E_NO_AGENTS === '1',
  registerSimulateVoiceTranscript(fn) {
    simulateVoiceTranscriptFn = typeof fn === 'function' ? fn : null
  },
  simulateVoiceTranscript(text) {
    simulateVoiceTranscriptFn?.(text)
  },
  registerSimulateGraduateArchive(fn) {
    simulateGraduateArchiveFn = typeof fn === 'function' ? fn : null
  },
  async simulateGraduateInboxArchive(sourceTexts) {
    return simulateGraduateArchiveFn?.(sourceTexts) ?? { moved: [], skipped: [] }
  },
  registerSimulateSlashWritebackOpen(fn) {
    simulateSlashWritebackOpenFn = typeof fn === 'function' ? fn : null
  },
  async simulateSlashWritebackOpen(cmdId) {
    return simulateSlashWritebackOpenFn?.(cmdId) ?? null
  },
  registerSetAutoSave(fn) {
    setAutoSaveFn = typeof fn === 'function' ? fn : null
  },
  setAutoSave(enabled) {
    setAutoSaveFn?.(enabled)
  },
  registerSimulateExternalFileRemoved(fn) {
    simulateExternalFileRemovedFn = typeof fn === 'function' ? fn : null
  },
  async simulateExternalFileRemoved(filePath) {
    return simulateExternalFileRemovedFn?.(filePath)
  },
  queueSelectDirectory(result) {
    if (process.env.METAMATES_E2E !== '1') return
    mockSelectDirectoryQueue.push(result)
  },
  clearSelectDirectoryQueue() {
    mockSelectDirectoryQueue = []
  },
})

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  listFiles: (dirPath, recursive) => ipcRenderer.invoke('list-files', dirPath, recursive),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  selectDirectory: () => {
    if (process.env.METAMATES_E2E === '1' && mockSelectDirectoryQueue.length > 0) {
      return Promise.resolve(mockSelectDirectoryQueue.shift())
    }
    return ipcRenderer.invoke('select-directory')
  },
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  saveFileDialog: () => ipcRenderer.invoke('save-file-dialog'),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  writeClipboardText: (text) => {
    clipboard.writeText(String(text ?? ''))
    return true
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDatabaseStatus: () => ipcRenderer.invoke('get-database-status'),
  waitDesktopReady: () => ipcRenderer.invoke('wait-desktop-ready'),
  onDesktopReady: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('desktop-ready', handler)
    return () => ipcRenderer.removeListener('desktop-ready', handler)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater-check'),
    quitAndInstall: () => ipcRenderer.invoke('updater-quit-and-install'),
    onStatus: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('updater-status', handler)
      return () => ipcRenderer.removeListener('updater-status', handler)
    },
  },
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  watchDirectory: (dirPath) => ipcRenderer.invoke('watch-directory', dirPath),
  unwatchDirectory: () => ipcRenderer.invoke('unwatch-directory'),
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  syncWorkspacePath: (workspacePath) => ipcRenderer.invoke('sync-workspace-path', workspacePath),
  initWorkspace: (workspacePath, language) => ipcRenderer.invoke('init-workspace', workspacePath, language),
  reinitWorkspace: (workspacePath, language) => ipcRenderer.invoke('reinit-workspace', workspacePath, language),
  detectLegacyPaths: (workspacePath, language) => ipcRenderer.invoke('detect-legacy-paths', workspacePath, language),
  migrateWorkspace: (workspacePath, language) => ipcRenderer.invoke('migrate-workspace', workspacePath, language),
  
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('write-text-file', filePath, content),
  
  checkCliAvailable: (cliName) => ipcRenderer.invoke('check-cli-available', cliName),
  installCli: (cliName) => ipcRenderer.invoke('install-cli', cliName),
  uninstallCli: (cliName) => ipcRenderer.invoke('uninstall-cli', cliName),
  
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onMaximizeChange: (callback) => {
      ipcRenderer.on('maximize-change', (event, isMaximized) => callback(isMaximized))
    }
  },
  
  path: {
    basename: (filePath) => ipcRenderer.invoke('path-basename', filePath),
    join: (...paths) => ipcRenderer.invoke('path-join', paths),
    dirname: (filePath) => ipcRenderer.invoke('path-dirname', filePath),
    resolve: (...paths) => ipcRenderer.invoke('path-resolve', paths),
    isAbsolute: (filePath) => ipcRenderer.invoke('path-is-absolute', filePath),
    relative: (from, to) => ipcRenderer.invoke('path-relative', from, to),
  },
  
  pathIsAbsolute: (filePath) => ipcRenderer.invoke('path-is-absolute', filePath),
  pathJoin: (...paths) => ipcRenderer.invoke('path-join', paths),
  pathResolve: (...paths) => ipcRenderer.invoke('path-resolve', paths),
  pathRelative: (from, to) => ipcRenderer.invoke('path-relative', from, to),
  
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', (event, data) => callback(data))
  },
  removeFileChangedListener: () => {
    ipcRenderer.removeAllListeners('file-changed')
  },
  onWatchError: (callback) => {
    ipcRenderer.on('watch-error', (event, error) => callback(error))
  },
  removeWatchErrorListener: () => {
    ipcRenderer.removeAllListeners('watch-error')
  },
  
  vaultApi: {
    start: (workspacePath, port, calendarIcsPath, bindLan) =>
      ipcRenderer.invoke('vault-api-start', workspacePath, port, calendarIcsPath, bindLan),
    stop: () => ipcRenderer.invoke('vault-api-stop'),
    getStatus: () => ipcRenderer.invoke('vault-api-status'),
    getLanAddresses: () => ipcRenderer.invoke('get-lan-addresses'),
  },

  calendar: {
    pickFile: () => ipcRenderer.invoke('pick-calendar-file'),
    getEvents: (workspacePath, icsPath, dateIso) =>
      ipcRenderer.invoke('get-calendar-events', workspacePath, icsPath, dateIso),
  },

  intelligence: {
    prepareImport: (sourcePath) => ipcRenderer.invoke('prepare-intelligence-import', sourcePath),
    prepareUrl: (rawUrl) => ipcRenderer.invoke('prepare-intelligence-url', rawUrl),
    isImportable: (filePath) => ipcRenderer.invoke('is-importable-document', filePath),
  },

  ollama: {
    getStatus: (baseUrl) => ipcRenderer.invoke('ollama-status', baseUrl),
  },

  speech: {
    isAvailable: () => ipcRenderer.invoke('speech-is-available'),
    start: (language) => ipcRenderer.invoke('speech-start', language),
    stop: () => ipcRenderer.invoke('speech-stop'),
    ...(process.env.METAMATES_E2E === '1'
      ? {
          e2eInject: (update) => ipcRenderer.invoke('speech-e2e-inject', update),
        }
      : {}),
    onTranscript: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('speech-transcript', handler)
      return () => ipcRenderer.removeListener('speech-transcript', handler)
    },
    onError: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('speech-error', handler)
      return () => ipcRenderer.removeListener('speech-error', handler)
    },
  },

  acp: {
    detectAgents: () => ipcRenderer.invoke('get-detected-agents'),
    getAllInstalledAgents: () => ipcRenderer.invoke('get-all-installed-agents'),
    setCliAgentEnabled: (backendId, enabled) => ipcRenderer.invoke('set-cli-agent-enabled', backendId, enabled),
    onCliAgentsChanged: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli-agents-changed', handler)
      return () => ipcRenderer.removeListener('cli-agents-changed', handler)
    },
    getBackends: () => ipcRenderer.invoke('get-detected-agents'),
    getCurrentBackend: () => ipcRenderer.invoke('get-current-backend'),
    setWorkspacePath: (workspacePath) => ipcRenderer.invoke('set-workspace-path', workspacePath),
    connect: (backendId) => ipcRenderer.invoke('connect', backendId),
    ensureSession: (backendId, options) => ipcRenderer.invoke('acp-ensure-session', backendId, options),
    checkAgentHealth: (backendId) => ipcRenderer.invoke('acp-check-agent-health', backendId),
    newSession: (backendId, resume = true) => ipcRenderer.invoke('new-session', backendId, resume),
    sendPrompt: (text, presetContext, attachments, displayContent) => ipcRenderer.invoke('send-prompt', text, presetContext, attachments, displayContent),
    disconnect: (backendId) => ipcRenderer.invoke('disconnect', backendId),
    getModels: () => ipcRenderer.invoke('get-models'),
    setModel: (modelId) => ipcRenderer.invoke('set-model', modelId),
    setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
    getMode: () => ipcRenderer.invoke('get-mode'),
    getSessionInfo: (backendId) => ipcRenderer.invoke('get-session-info', backendId),
    clearSession: (backendId) => ipcRenderer.invoke('clear-session', backendId),
    getConversationHistory: (backendId, options) =>
      ipcRenderer.invoke('get-conversation-history', backendId, options),
    clearConversationHistory: (backendId) => ipcRenderer.invoke('clear-conversation-history', backendId),
    switchBackend: (backendId) => ipcRenderer.invoke('switch-backend', backendId),
    selectBackend: (backendId) => ipcRenderer.invoke('select-backend', backendId),
    getConnectionStatus: (backendId) => ipcRenderer.invoke('get-connection-status', backendId),
    getAllConnectionStatuses: () => ipcRenderer.invoke('get-all-connection-statuses'),
    invalidateCloudReachability: (backendId) => ipcRenderer.invoke('invalidate-cloud-reachability', backendId),
    warmupAllAgents: () => ipcRenderer.invoke('warmup-all-agents'),
    cancelPrompt: (backendId) => ipcRenderer.send('cancel-prompt', backendId ? { backend: backendId } : undefined),
    
    onBackendReady: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('acp-backend-ready', handler)
      return () => ipcRenderer.removeListener('acp-backend-ready', handler)
    },
    onAcpStreamMessage: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('acp-stream-message', handler)
      return () => ipcRenderer.removeListener('acp-stream-message', handler)
    },
    onSessionUpdate: (callback) => {
      console.log('[PRELOAD] Registering session-update listener')
      const handler = (event, data) => {
        console.log('[PRELOAD] session-update received:', JSON.stringify(data).substring(0, 200))
        callback(data)
      }
      ipcRenderer.on('session-update', handler)
      return () => {
        console.log('[PRELOAD] Removing session-update listener')
        ipcRenderer.removeListener('session-update', handler)
      }
    },
    onConnectionStatusChange: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('acp-connection-status', handler)
      return () => ipcRenderer.removeListener('acp-connection-status', handler)
    },
    onAgentStatus: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('agent-status', handler)
      return () => ipcRenderer.removeListener('agent-status', handler)
    },
    onEndTurn: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('end-turn', handler)
      return () => ipcRenderer.removeListener('end-turn', handler)
    },
    onDisconnected: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('disconnected', handler)
      return () => ipcRenderer.removeListener('disconnected', handler)
    },
    onPermissionRequest: (callback) => {
      ipcRenderer.on('permission-request', (event, data) => callback(data))
    },
    onAuthUrl: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('acp-auth-url', handler)
      return () => ipcRenderer.removeListener('acp-auth-url', handler)
    },
    onAuthDeprecated: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('acp-auth-deprecated', handler)
      return () => ipcRenderer.removeListener('acp-auth-deprecated', handler)
    },
    respondToPermission: (backend, requestId, optionId) => {
      ipcRenderer.send('respond-to-permission', { backend, requestId, optionId })
    },
    rejectPermission: (backend, requestId) => {
      ipcRenderer.send('reject-permission', { backend, requestId })
    },
    getAvailableCommands: (backendId) => ipcRenderer.invoke('get-available-commands', backendId),
    autoTestMessage: (backend) => {
      return ipcRenderer.invoke('auto-test-message', backend)
    },
    readSkillFile: (skillName, backendId) => {
      return ipcRenderer.invoke('read-skill-file', skillName, backendId)
    },
    authenticate: (backendId, methodId, meta) => ipcRenderer.invoke('acp-authenticate', backendId, methodId, meta),
    getAuthMethods: (backendId) => ipcRenderer.invoke('acp-get-auth-methods', backendId),
    openGeminiTerminalLogin: () => ipcRenderer.invoke('acp-open-gemini-terminal-login'),
    checkGeminiAuth: () => ipcRenderer.invoke('acp-check-gemini-auth'),
    reloadSessions: () => ipcRenderer.invoke('acp-reload-sessions'),
    refreshAgents: () => ipcRenderer.invoke('acp-refresh-agents'),
    syncWorkspaceSkills: (workspacePath, language) =>
      ipcRenderer.invoke('sync-workspace-skills', workspacePath, language),
    getMcpServersConfig: () => ipcRenderer.invoke('get-mcp-servers-config'),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('acp-stream-message')
      ipcRenderer.removeAllListeners('session-update')
      ipcRenderer.removeAllListeners('end-turn')
      ipcRenderer.removeAllListeners('disconnected')
      ipcRenderer.removeAllListeners('permission-request')
      ipcRenderer.removeAllListeners('acp-auth-url')
      ipcRenderer.removeAllListeners('acp-auth-deprecated')
      ipcRenderer.removeAllListeners('acp-backend-ready')
    }
  }
})
