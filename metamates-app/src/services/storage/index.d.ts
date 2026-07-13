export interface AppSettings {
    theme: 'dark' | 'light' | 'system';
    colorScheme?: 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage';
    lightPalette?: 'paper' | 'cold';
    fontSize: number;
    autoSave: boolean;
    language?: 'zh' | 'en';
    userTimezone?: string;
    workspacePath?: string;
    vaultApiEnabled?: boolean;
    vaultApiPort?: number;
    vaultApiLanAccess?: boolean;
    calendarIcsPath?: string;
    ollamaEnabled?: boolean;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    mobileReaderEnabled?: boolean;
    speechEngine?: 'auto' | 'whisper' | 'web' | 'native';
    mcpServers?: Array<{
        id: string;
        name: string;
        enabled: boolean;
        command: string;
        args?: string[];
        env?: Record<string, string>;
        builtin?: boolean;
    }>;
    acpPreferences?: Record<string, { mode?: string; modelId?: string }>;
    cliAgentEnabled?: Record<string, boolean>;
    lastAgentBackend?: string;
    cachedAgentToolbar?: Array<{
        backend: string;
        name: string;
        cliPath?: string;
        acpArgs?: string[];
        logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string };
    }>;
    geminiApiKey?: string;
    engineDisplayName?: string;
    engineNamingSkippedAt?: number;
    engineNamingPromptCount?: number;
    engineSetupStatus?: 'pending' | 'vault_only' | 'ready';
    engineSetupSkippedAt?: number;
    preferredAssistant?: string;
    recentFiles: string[];
    lastOpenedFile?: string;
}
export interface WorkspaceState {
    currentFile: string;
    openFiles: string[];
    editorState: Record<string, any>;
}
export interface CommandHistory {
    command: string;
    timestamp: number;
    result?: string;
}
export interface StorageData {
    settings: AppSettings;
    workspace: WorkspaceState;
    commandHistory: CommandHistory[];
    version: string;
}
declare class StorageService {
    private storageKey;
    getSettings(): Promise<AppSettings>;
    saveSettings(settings: Partial<AppSettings>): Promise<void>;
    getWorkspaceState(): Promise<WorkspaceState>;
    saveWorkspaceState(workspace: Partial<WorkspaceState>): Promise<void>;
    getCommandHistory(): Promise<CommandHistory[]>;
    addCommandHistory(item: CommandHistory): Promise<void>;
    clearCommandHistory(): Promise<void>;
    addRecentFile(filePath: string): Promise<void>;
    exportData(): Promise<string>;
    importData(jsonString: string): Promise<boolean>;
    clearAll(): Promise<void>;
    private getData;
    private saveData;
}
export declare const storageService: StorageService;
export {};
