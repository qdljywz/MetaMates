export interface AppSettings {
    theme: 'dark' | 'light' | 'system';
    colorScheme?: 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage';
    fontSize: number;
    autoSave: boolean;
    language?: 'zh' | 'en';
    workspacePath?: string;
    vaultApiEnabled?: boolean;
    vaultApiPort?: number;
    vaultApiLanAccess?: boolean;
    calendarIcsPath?: string;
    ollamaEnabled?: boolean;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    mobileReaderEnabled?: boolean;
    mcpServers?: Array<{
        id: string;
        name: string;
        enabled: boolean;
        command: string;
        args?: string[];
        env?: Record<string, string>;
        builtin?: boolean;
    }>;
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
