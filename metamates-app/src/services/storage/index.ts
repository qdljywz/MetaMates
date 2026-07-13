export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  colorScheme?: 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage'
  /** Light-mode canvas palette (applies when resolved theme is light). */
  lightPalette?: 'paper' | 'cold'
  fontSize: number
  autoSave: boolean
  language?: 'zh' | 'en'
  userTimezone?: string
  workspacePath?: string
  vaultApiEnabled?: boolean
  vaultApiPort?: number
  vaultApiLanAccess?: boolean
  calendarIcsPath?: string
  ollamaEnabled?: boolean
  ollamaBaseUrl?: string
  ollamaModel?: string
  mobileReaderEnabled?: boolean
  /** Voice input backend preference (auto = local Whisper first). */
  speechEngine?: 'auto' | 'whisper' | 'web' | 'native'
  mcpServers?: Array<{
    id: string
    name: string
    enabled: boolean
    command: string
    args?: string[]
    env?: Record<string, string>
    builtin?: boolean
  }>
  acpPreferences?: Record<string, { mode?: string; modelId?: string }>
  /** Per-backend toggle for showing CLI in Agent panel (default: enabled). */
  cliAgentEnabled?: Record<string, boolean>
  /** Last selected Agent backend — restored on startup before re-scan. */
  lastAgentBackend?: string
  /** Snapshot of Agent toolbar for instant UI hydration. */
  cachedAgentToolbar?: Array<{
    backend: string
    name: string
    cliPath?: string
    acpArgs?: string[]
    logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
  }>
  /** API key entered in MetaMates settings / auth modal (optional; OS keychain preferred). */
  geminiApiKey?: string
  /** User-chosen label for the right-side thinking engine panel. */
  engineDisplayName?: string
  /** Timestamp when user skipped the engine-naming empty-state prompt. */
  engineNamingSkippedAt?: number
  /** How many times the naming prompt was shown (including skips). */
  engineNamingPromptCount?: number
  /** Thinking-engine onboarding: pending | vault_only | ready */
  engineSetupStatus?: 'pending' | 'vault_only' | 'ready'
  engineSetupSkippedAt?: number
  /** Preferred AI assistant backend from engine setup funnel */
  preferredAssistant?: string
  recentFiles: string[]
  lastOpenedFile?: string
}

export interface WorkspaceState {
  currentFile: string
  openFiles: string[]
  editorState: Record<string, any>
}

export interface CommandHistory {
  command: string
  timestamp: number
  result?: string
}

export interface StorageData {
  settings: AppSettings
  workspace: WorkspaceState
  commandHistory: CommandHistory[]
  version: string
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  autoSave: true,
  userTimezone: 'Asia/Shanghai',
  recentFiles: [],
}

const STORAGE_VERSION = '1.0.0'

class StorageService {
  private storageKey = 'metamates-storage'

  async getSettings(): Promise<AppSettings> {
    const data = await this.getData()
    let settings = data.settings

    if (typeof window !== 'undefined' && window.electronAPI?.getSettings) {
      try {
        const electronSettings = (await window.electronAPI.getSettings()) as Partial<AppSettings> | null
        if (electronSettings) {
          settings = {
            ...electronSettings,
            ...data.settings,
            vaultApiEnabled: data.settings.vaultApiEnabled ?? electronSettings.vaultApiEnabled,
            vaultApiPort: data.settings.vaultApiPort ?? electronSettings.vaultApiPort,
            vaultApiLanAccess: data.settings.vaultApiLanAccess ?? electronSettings.vaultApiLanAccess,
            mobileReaderEnabled: data.settings.mobileReaderEnabled ?? electronSettings.mobileReaderEnabled,
          }
          if (electronSettings.workspacePath && electronSettings.workspacePath !== data.settings.workspacePath) {
            data.settings = settings
            await this.saveData(data)
          }
        }
      } catch {
        // ignore — fall back to localStorage only
      }
    }

    return settings
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    const data = await this.getData()
    data.settings = { ...data.settings, ...settings }
    await this.saveData(data)

    if (typeof window !== 'undefined' && window.electronAPI?.saveSettings) {
      await window.electronAPI.saveSettings(settings).catch(console.error)
    }
  }

  async getWorkspaceState(): Promise<WorkspaceState> {
    const data = await this.getData()
    return data.workspace
  }

  async saveWorkspaceState(workspace: Partial<WorkspaceState>): Promise<void> {
    const data = await this.getData()
    data.workspace = { ...data.workspace, ...workspace }
    await this.saveData(data)
  }

  async getCommandHistory(): Promise<CommandHistory[]> {
    const data = await this.getData()
    return data.commandHistory
  }

  async addCommandHistory(item: CommandHistory): Promise<void> {
    const data = await this.getData()
    data.commandHistory = [item, ...data.commandHistory].slice(0, 100)
    await this.saveData(data)
  }

  async clearCommandHistory(): Promise<void> {
    const data = await this.getData()
    data.commandHistory = []
    await this.saveData(data)
  }

  async addRecentFile(filePath: string): Promise<void> {
    const data = await this.getData()
    const recentFiles = data.settings.recentFiles.filter(f => f !== filePath)
    data.settings.recentFiles = [filePath, ...recentFiles].slice(0, 10)
    await this.saveData(data)
  }

  async exportData(): Promise<string> {
    const data = await this.getData()
    return JSON.stringify(data, null, 2)
  }

  async importData(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString) as StorageData
      if (data.version && data.settings) {
        await this.saveData(data)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(this.storageKey)
  }

  private async getData(): Promise<StorageData> {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const data = JSON.parse(stored) as StorageData
        return {
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          workspace: data.workspace || { currentFile: '', openFiles: [], editorState: {} },
          commandHistory: data.commandHistory || [],
          version: STORAGE_VERSION,
        }
      }
    } catch {
      // ignore
    }

    return {
      settings: DEFAULT_SETTINGS,
      workspace: { currentFile: '', openFiles: [], editorState: {} },
      commandHistory: [],
      version: STORAGE_VERSION,
    }
  }

  private async saveData(data: StorageData): Promise<void> {
    localStorage.setItem(this.storageKey, JSON.stringify(data))
  }
}

export const storageService = new StorageService()
