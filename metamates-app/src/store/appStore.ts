export interface OpenTab {
  path: string
  name: string
  isDirty: boolean
}

export interface AcpBackend {
  id: string
  name: string
  cliCommand?: string
  acpArgs?: string[]
  enabled?: boolean
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

export interface AcpConnection {
  connectionId: string
  backend: AcpBackend
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_required'
  sessionId?: string
  modelId?: string
  mode?: string
  error?: string
}

export interface AcpMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status?: 'streaming' | 'complete'
}

export interface AppState {
  workspacePath: string
  currentFile: string | null
  openTabs: OpenTab[]
  files: FileInfo[]
  commandHistory: CommandHistoryItem[]
  settings: AppSettings
  acp: AcpState
  editorSidebarTab: 'links' | 'tags' | 'properties' | null
  editorNavigation: { path: string; line?: number; token: number } | null
}

export interface AcpState {
  backends: AcpBackend[]
  currentConnection: AcpConnection | null
  messages: AcpMessage[]
  isStreaming: boolean
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  children?: FileInfo[]
}

export interface CommandHistoryItem {
  command: string
  timestamp: number
  result?: string
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  colorScheme?: 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage'
  fontSize: number
  autoSave: boolean
  language?: 'zh' | 'en'
  workspacePath?: string
  vaultApiEnabled?: boolean
  vaultApiPort?: number
  recentFiles?: string[]
  lastOpenedFile?: string
}

export type AppAction =
  | { type: 'SET_WORKSPACE'; payload: string }
  | { type: 'SET_CURRENT_FILE'; payload: string | null }
  | { type: 'SET_FILES'; payload: FileInfo[] }
  | { type: 'ADD_COMMAND_HISTORY'; payload: CommandHistoryItem }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'ADD_TAB'; payload: OpenTab }
  | { type: 'CLOSE_TAB'; payload: string }
  | { type: 'UPDATE_TAB_DIRTY'; payload: { path: string; isDirty: boolean } }
  | { type: 'SET_ACTIVE_TAB'; payload: string }
  | { type: 'SET_ACP_BACKENDS'; payload: AcpBackend[] }
  | { type: 'SET_ACP_CONNECTION'; payload: AcpConnection | null }
  | { type: 'ADD_ACP_MESSAGE'; payload: AcpMessage }
  | { type: 'CLEAR_ACP_MESSAGES' }
  | { type: 'SET_ACP_STREAMING'; payload: boolean }

  | { type: 'SET_ACP_ERROR'; payload: string }
  | { type: 'FOCUS_EDITOR_SIDEBAR'; payload: 'links' | 'tags' }
  | { type: 'OPEN_EDITOR_AT'; payload: { path: string; name?: string; line?: number } }

const initialState: AppState = {
  workspacePath: '',
  currentFile: '',
  openTabs: [],
  files: [],
  commandHistory: [],
  settings: {
    theme: 'dark',
    fontSize: 14,
    autoSave: true,
  },
  acp: {
    backends: [],
    currentConnection: null,
    messages: [],
    isStreaming: false,
  },
  editorSidebarTab: null,
  editorNavigation: null,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_WORKSPACE':
      return { ...state, workspacePath: action.payload }
    case 'SET_CURRENT_FILE':
      return { ...state, currentFile: action.payload }
    case 'SET_FILES':
      return { ...state, files: action.payload }
    case 'ADD_COMMAND_HISTORY':
      return { 
        ...state, 
        commandHistory: [action.payload, ...state.commandHistory].slice(0, 100) 
      }
    case 'UPDATE_SETTINGS':
      return { 
        ...state, 
        settings: { ...state.settings, ...action.payload } 
      }
    case 'ADD_TAB': {
      const exists = state.openTabs.find(tab => tab.path === action.payload.path)
      if (exists) {
        return { ...state, currentFile: action.payload.path }
      }
      return { 
        ...state, 
        openTabs: [...state.openTabs, action.payload],
        currentFile: action.payload.path
      }
    }
    case 'CLOSE_TAB': {
      const newTabs = state.openTabs.filter(tab => tab.path !== action.payload)
      const closedIndex = state.openTabs.findIndex(tab => tab.path === action.payload)
      let newCurrentFile = state.currentFile
      
      if (state.currentFile === action.payload) {
        if (newTabs.length > 0) {
          const newIndex = Math.min(closedIndex, newTabs.length - 1)
          newCurrentFile = newTabs[newIndex]?.path || ''
        } else {
          newCurrentFile = ''
        }
      }
      
      return { 
        ...state, 
        openTabs: newTabs,
        currentFile: newCurrentFile
      }
    }
    case 'UPDATE_TAB_DIRTY': {
      const newTabs = state.openTabs.map(tab => 
        tab.path === action.payload.path 
          ? { ...tab, isDirty: action.payload.isDirty }
          : tab
      )
      return { ...state, openTabs: newTabs }
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, currentFile: action.payload }
    case 'SET_ACP_BACKENDS':
      return { ...state, acp: { ...state.acp, backends: action.payload } }
    case 'SET_ACP_CONNECTION':
      return { ...state, acp: { ...state.acp, currentConnection: action.payload } }
    case 'ADD_ACP_MESSAGE':
      return { 
        ...state, 
        acp: { 
          ...state.acp, 
          messages: [...state.acp.messages, action.payload] 
        } 
      }
    case 'CLEAR_ACP_MESSAGES':
      return { ...state, acp: { ...state.acp, messages: [] } }
    case 'SET_ACP_STREAMING':
      return { ...state, acp: { ...state.acp, isStreaming: action.payload } }
    case 'SET_ACP_ERROR':
      return { 
        ...state, 
        acp: { 
          ...state.acp, 
          currentConnection: state.acp.currentConnection 
            ? { ...state.acp.currentConnection, error: action.payload }
            : null
        } 
      }
    case 'FOCUS_EDITOR_SIDEBAR':
      return { ...state, editorSidebarTab: action.payload }
    case 'OPEN_EDITOR_AT': {
      const { path, line } = action.payload
      const name = action.payload.name || path.split(/[/\\]/).pop() || path
      const exists = state.openTabs.find((tab) => tab.path === path)
      return {
        ...state,
        openTabs: exists
          ? state.openTabs
          : [...state.openTabs, { path, name, isDirty: false }],
        currentFile: path,
        editorNavigation: { path, line, token: Date.now() },
      }
    }
    default:
      return state
  }
}

export { initialState }
