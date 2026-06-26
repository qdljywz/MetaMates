export interface DetectedAgent {
  backend: string
  name: string
  cliPath?: string
  acpArgs?: string[]
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

export interface AcpAuthMethod {
  id: string
  name?: string
}

export interface AcpSwitchBackendResult {
  success: boolean
  sessionId?: string
  mode?: string
  error?: string
  authRequired?: boolean
  authMethods?: AcpAuthMethod[]
  lazy?: boolean
  pending?: boolean
}

export interface AcpBackendReadyEvent {
  backend: string
  success: boolean
  sessionId?: string
  mode?: string
  error?: string
  quotaExceeded?: boolean
  authRequired?: boolean
  authMethods?: AcpAuthMethod[]
}

export interface AcpNewSessionResult {
  sessionId?: string
  mode?: string
  cached?: boolean
  resumed?: boolean
  models?: unknown
  success?: boolean
  error?: string
  quotaExceeded?: boolean
  authRequired?: boolean
  authMethods?: AcpAuthMethod[]
}

export interface ConversationHistoryResult {
  messages: SessionMessage[]
  total: number
  hasMore: boolean
}

export interface ConversationHistoryOptions {
  limit?: number
  before?: number
}

export interface SessionMessage {
  id: string
  type: string
  content: any
  position?: string
  created_at?: number
}

export interface FileChangeEvent {
  type: string
  filename: string
  dirPath: string
}

export interface FileInfo {
  name: string
  isDirectory: boolean
  path: string
  size?: number
  modified?: number
}

export interface ElectronAPI {
  getSettings: () => Promise<any>
  saveSettings: (settings: any) => Promise<{ success: boolean; error?: string }>
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  readFileBase64: (filePath: string) => Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  readTextFile: (filePath: string) => Promise<string>
  writeTextFile: (filePath: string, content: string) => Promise<void>
  listFiles: (dirPath: string, recursive?: boolean) => Promise<{ success: boolean; files?: FileInfo[]; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  selectDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<{ canceled: boolean; filePath?: string }>
  saveFileDialog: () => Promise<{ canceled: boolean; filePath?: string }>
  fileExists: (filePath: string) => Promise<{ exists: boolean }>
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  createDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  getFileStats: (filePath: string) => Promise<{ success: boolean; stats?: { size: number; modified: number }; error?: string }>
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  watchDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  unwatchDirectory: () => Promise<{ success: boolean }>
  openInExplorer: (filePath: string) => Promise<void>
  syncWorkspacePath: (workspacePath: string) => Promise<{ success: boolean }>
  initWorkspace: (workspacePath: string, language?: string) => Promise<{ success: boolean; initialized: boolean; reason?: string; error?: string; foldersCreated?: string[] }>
  reinitWorkspace: (workspacePath: string, language?: string) => Promise<{ success: boolean; createdItems?: string[]; message?: string; error?: string }>
  detectLegacyPaths: (workspacePath: string, language?: string) => Promise<{ success: boolean; legacy: string[]; needsMigration: boolean; error?: string }>
  migrateWorkspace: (workspacePath: string, language?: string) => Promise<{ success: boolean; migrated: string[]; skipped: string[]; error?: string }>
  
  checkCliAvailable: (cliName: string) => Promise<{ available: boolean; version?: string; path?: string }>
  installCli: (installCommand: string) => Promise<{ success: boolean; error?: string }>
  uninstallCli: (cliName: string) => Promise<{ success: boolean; error?: string }>
  
  windowMinimize: () => Promise<{ success: boolean }>
  windowMaximize: () => Promise<{ success: boolean }>
  windowClose: () => Promise<{ success: boolean }>
  windowIsMaximized: () => Promise<boolean>
  
  window: {
    minimize: () => Promise<{ success: boolean }>
    maximize: () => Promise<{ success: boolean }>
    close: () => Promise<{ success: boolean }>
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => void
  }
  
  path: {
    basename: (filePath: string) => Promise<string>
    join: (...paths: string[]) => Promise<string>
    dirname: (filePath: string) => Promise<string>
    resolve: (...paths: string[]) => Promise<string>
    isAbsolute: (filePath: string) => Promise<boolean>
    relative: (from: string, to: string) => Promise<string>
  }
  
  pathIsAbsolute: (filePath: string) => Promise<boolean>
  pathJoin: (...paths: string[]) => Promise<string>
  pathResolve: (...paths: string[]) => Promise<string>
  pathRelative: (from: string, to: string) => Promise<string>
  
  terminal: {
    start: (cwd?: string) => Promise<{ success: boolean; pid?: number; error?: string }>
    input: (pid: number, data: string) => Promise<{ success: boolean; error?: string }>
    resize: (pid: number, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>
    kill: (pid: number) => Promise<{ success: boolean; error?: string }>
    onOutput: (callback: (data: { type: string; data: string; pid?: number }) => void) => void
    removeOutputListener: () => void
    removeListeners: () => void
  }
  
  onFileChanged: (callback: (data: FileChangeEvent) => void) => void
  removeFileChangedListener: () => void
  onWatchError: (callback: (error: string) => void) => void
  removeWatchErrorListener: () => void

  vaultApi: {
    start: (
      workspacePath: string,
      port?: number,
      calendarIcsPath?: string,
      bindLan?: boolean
    ) => Promise<{ success: boolean; port: number; error?: string }>
    stop: () => Promise<{ success: boolean }>
    getStatus: () => Promise<{ running: boolean; port: number; workspacePath: string }>
    getLanAddresses: () => Promise<{ addresses: string[] }>
  }

  calendar: {
    pickFile: () => Promise<{ canceled: boolean; filePath?: string }>
    getEvents: (
      workspacePath: string,
      icsPath?: string,
      dateIso?: string
    ) => Promise<{
      success: boolean
      events: Array<{ summary: string; time: string; location?: string }>
      source: string | null
      date: string
      error?: string
    }>
  }

  intelligence: {
    prepareImport: (sourcePath: string) => Promise<{
      success: boolean
      error?: string
      format?: string
      mimeType?: string
      text?: string
      metadata?: Record<string, string>
      warnings?: string[]
      sourceFileName?: string
      sourceRelativePath?: string
      archivedRelativePath?: string
      sourceCopied?: boolean
    }>
    prepareUrl: (rawUrl: string) => Promise<{
      success: boolean
      error?: string
      format?: 'url'
      sourceUrl?: string
      finalUrl?: string
      title?: string
      text?: string
      warnings?: string[]
    }>
    isImportable: (filePath: string) => Promise<{ importable: boolean; format?: string | null }>
  }

  ollama: {
    getStatus: (baseUrl?: string) => Promise<{
      running: boolean
      baseUrl: string
      models: Array<{ name: string }>
      error?: string
    }>
  }

  speech: {
    isAvailable: () => Promise<{ available: boolean; running?: boolean }>
    start: (language?: string) => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<{ success: boolean }>
    onTranscript: (callback: (data: { final: string; interim: string }) => void) => () => void
    onError: (callback: (data: { code: string; message?: string }) => void) => () => void
  }
  
  acp: {
    detectAgents: () => Promise<DetectedAgent[]>
    getAllInstalledAgents: () => Promise<DetectedAgent[]>
    setCliAgentEnabled: (backendId: string, enabled: boolean) => Promise<{ success: boolean; agents: DetectedAgent[]; error?: string }>
    onCliAgentsChanged: (callback: (data: { agents: DetectedAgent[] }) => void) => () => void
    getBackends: () => Promise<DetectedAgent[]>
    setWorkspacePath: (workspacePath: string) => Promise<{ success: boolean }>
    connect: (backendId: string, options?: { autoStart?: boolean }) => Promise<{
      success: boolean
      cached?: boolean
      connectionId?: string
      sessionId?: string
      error?: string
      authRequired?: boolean
      authMethods?: Array<{ id: string; name?: string }>
    }>
    ensureSession: (
      backendId: string,
      options?: { freshSession?: boolean },
    ) => Promise<AcpNewSessionResult>
    checkAgentHealth: (backendId: string) => Promise<{
      available: boolean
      needsAuth?: boolean
      error?: string
      latencyMs?: number
    }>
    newSession: (backendId?: string, resume?: boolean) => Promise<AcpNewSessionResult>
    sendPrompt: (text: string, presetContext: string | null, attachments?: Array<{ path: string; name: string }>, displayContent?: string) => Promise<any>
    disconnect: (backendId?: string) => Promise<{ success: boolean }>
    getModels: () => Promise<{ models: { id: string; name: string }[]; availableModels?: { id: string; name: string }[] }>
    setModel: (modelId: string) => Promise<any>
    setMode: (mode: string) => Promise<{ success: boolean; mode?: string }>
    getMode: () => Promise<{ mode: string }>
    getSessionInfo: (backendId?: string) => Promise<{ sessionId: string; mode: string; modelId: string } | null>
    clearSession: (backendId?: string) => Promise<{ success: boolean }>
    getConversationHistory: (
      backendId?: string,
      options?: ConversationHistoryOptions,
    ) => Promise<ConversationHistoryResult>
    clearConversationHistory: (backendId?: string) => Promise<{ success: boolean }>
    switchBackend: (backendId: string) => Promise<AcpSwitchBackendResult>
    selectBackend: (backendId: string) => Promise<AcpSwitchBackendResult>
    getConnectionStatus: (backendId: string) => Promise<{
      connected: boolean
      hasSession: boolean
      ready: boolean
      needsAuth: boolean
      lifecycle?: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'auth_required'
      cloudReachable?: boolean
      error?: string
      mode?: string
      modelId?: string
    }>
    invalidateCloudReachability: (backendId?: string) => Promise<{ success: boolean }>
    warmupAllAgents: () => Promise<{ success: boolean; count: number }>
    getAllConnectionStatuses: () => Promise<Record<string, {
      connected: boolean
      hasSession: boolean
      ready: boolean
      needsAuth: boolean
      lifecycle?: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'auth_required'
      cloudReachable?: boolean
      error?: string
      mode?: string
      modelId?: string
    }>>
    cancelPrompt: () => void
    respondToPermission: (backend: string, requestId: number, optionId: string) => void
    rejectPermission: (backend: string, requestId: number) => void
    getAvailableCommands: (backendId?: string) => Promise<Array<{ name: string; description?: string }>>
    autoTestMessage: (backend: string) => Promise<{ success: boolean; result?: any; error?: string }>
    readSkillFile: (skillName: string, backendId?: string) => Promise<{ success: boolean; content?: string; path?: string; error?: string }>
    authenticate: (backendId: string, methodId?: string, meta?: Record<string, unknown>) => Promise<{ success: boolean; sessionId?: string; error?: string; authMethods?: Array<{ id: string; name?: string }> }>
    getAuthMethods: (backendId: string) => Promise<Array<{ id: string; name?: string }>>
    openGeminiTerminalLogin: () => Promise<{ success: boolean; error?: string }>
    checkGeminiAuth: () => Promise<{ authenticated: boolean }>
    reloadSessions: () => Promise<{ results: Array<{ backend: string; success: boolean; sessionId?: string; error?: string }>; agents: DetectedAgent[] }>
    refreshAgents: () => Promise<DetectedAgent[]>
    syncWorkspaceSkills: (
      workspacePath?: string,
      language?: 'zh' | 'en',
    ) => Promise<{
      success: boolean
      created: string[]
      skipped: string[]
      backends: string[]
      error?: string
    }>
    getMcpServersConfig: () => Promise<Array<{ id: string; name: string; enabled: boolean; command: string; args?: string[]; env?: Record<string, string>; builtin?: boolean }>>
    
    onAcpStreamMessage: (callback: (data: { backend: string; message: import('../../electron/shared/responseMessage').IResponseMessage }) => void) => () => void
    onSessionUpdate: (callback: (data: { backend: string; update: any }) => void) => () => void
    onBackendReady: (callback: (data: AcpBackendReadyEvent) => void) => () => void
    onConnectionStatusChange: (callback: (data: {
      backend: string
      snapshot: {
        connected: boolean
        hasSession: boolean
        ready: boolean
        needsAuth: boolean
        lifecycle?: string
        error?: string
        mode?: string
        modelId?: string
      }
    }) => void) => () => void
    onAgentStatus: (callback: (data: { backend: string; status: string; error?: string }) => void) => () => void
    onEndTurn: (callback: (data: { backend: string }) => void) => () => void
    onDisconnected: (callback: (data: { code: number | null; signal: NodeJS.Signals | null; backend: string }) => void) => () => void
    onPermissionRequest: (callback: (data: any) => void) => void
    onAuthUrl: (callback: (data: { backend: string; url: string }) => void) => () => void
    onAuthDeprecated: (callback: (data: { backend: string; message: string }) => void) => () => void
    removeListeners: () => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
