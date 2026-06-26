# Metamates API 文档

## 架构概述

```
metamates-app/
├── electron/           # Electron主进程
│   ├── main.ts        # 主进程入口
│   └── preload.ts     # 预加载脚本
├── src/
│   ├── components/    # React组件
│   ├── store/         # 状态管理
│   ├── services/      # 服务层
│   │   ├── ai/       # AI服务
│   │   ├── commands/ # 命令处理
│   │   └── storage/  # 存储服务
│   ├── commands/      # 命令定义
│   ├── templates/     # 模板系统
│   └── utils/         # 工具函数
└── docs/              # 文档
```

## IPC API

### 文件操作

#### `readFile(path: string)`
读取文件内容。

```typescript
const result = await window.electronAPI.readFile('/path/to/file.md')
// result: { success: boolean; content?: string; error?: string }
```

#### `writeFile(path: string, content: string)`
写入文件内容。

```typescript
const result = await window.electronAPI.writeFile('/path/to/file.md', '# Hello')
// result: { success: boolean; error?: string }
```

#### `listFiles(dirPath: string)`
列出目录下的文件。

```typescript
const result = await window.electronAPI.listFiles('/path/to/dir')
// result: { success: boolean; files?: FileInfo[]; error?: string }

interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  modifiedTime?: number
}
```

#### `deleteFile(path: string)`
删除文件。

```typescript
const result = await window.electronAPI.deleteFile('/path/to/file.md')
// result: { success: boolean; error?: string }
```

### 对话框

#### `selectDirectory()`
选择目录对话框。

```typescript
const result = await window.electronAPI.selectDirectory()
// result: { canceled: boolean; filePaths: string[] }
```

#### `selectFile()`
选择文件对话框。

```typescript
const result = await window.electronAPI.selectFile()
// result: { canceled: boolean; filePaths: string[] }
```

#### `saveFileDialog(defaultPath?: string)`
保存文件对话框。

```typescript
const result = await window.electronAPI.saveFileDialog('/default/path.md')
// result: { canceled: boolean; filePath?: string }
```

## 状态管理

### AppContext

```typescript
interface AppState {
  workspace: string | null
  currentFile: string | null
  settings: AppSettings
  commandHistory: CommandHistoryItem[]
  recentFiles: string[]
  isLoading: boolean
  error: string | null
}

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  autoSave: boolean
  language?: 'zh' | 'en'
  workspacePath?: string
  vaultApiEnabled?: boolean
  recentFiles: string[]
}
```

> **Note:** Built-in API providers (`aiProvider`, `apiKey`) were removed. Use the ACP Agent panel with local CLI agents.

### Actions

```typescript
type AppAction =
  | { type: 'SET_WORKSPACE'; payload: string }
  | { type: 'SET_CURRENT_FILE'; payload: string }
  | { type: 'SET_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'ADD_COMMAND_HISTORY'; payload: CommandHistoryItem }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
```

## AI 服务（ACP only）

内置 OpenAI/智谱 API 已移除。通过右侧 **Agent 面板** 使用本机 CLI。

```typescript
const agents = await window.electronAPI.acp.detectAgents()
await window.electronAPI.acp.connect(agents[0].backend)
await window.electronAPI.acp.newSession(agents[0].backend)
await window.electronAPI.acp.sendPrompt('Summarize my vault', null)
```

## 命令系统

### 命令定义

```typescript
interface Command {
  id: string
  name: string
  description: string
  category: 'planning' | 'review' | 'insight' | 'sync' | 'config'
  icon?: string
  handler?: (context: CommandContext) => Promise<string>
}
```

### 注册命令

```typescript
import { commandRegistry } from '@/commands/registry'

commandRegistry.register({
  id: '/custom',
  name: '自定义命令',
  description: '这是一个自定义命令',
  category: 'config',
  handler: async (context) => {
    return '命令执行结果'
  }
})
```

## 模板系统

### 模板定义

```typescript
interface Template {
  id: string
  name: string
  description: string
  category: 'daily' | 'weekly' | 'monthly' | 'project' | 'review' | 'custom'
  content: string
  variables?: TemplateVariable[]
}

interface TemplateVariable {
  name: string
  description: string
  default?: string
  required?: boolean
}
```

### 使用模板

```typescript
import { templateManager } from '@/templates/definitions'

const content = templateManager.render('daily-plan', {
  date: '2024-01-01',
  focus: '今日重点任务'
})
```

## 存储服务

### 设置存储

```typescript
import { storageService } from '@/services/storage'

const settings = await storageService.getSettings()
await storageService.saveSettings({ theme: 'dark' })
```

### 工作区状态

```typescript
const state = await storageService.getWorkspaceState('/path/to/workspace')
await storageService.saveWorkspaceState('/path/to/workspace', state)
```

### 命令历史

```typescript
const history = await storageService.getCommandHistory()
await storageService.addCommandHistory({
  command: '/plan',
  input: '制定今日计划',
  output: '计划内容',
  timestamp: Date.now()
})
```

## 性能工具

### 性能监控

```typescript
import { performanceMonitor, measureAsync } from '@/utils'

const result = await measureAsync('load-files', async () => {
  return await window.electronAPI.listFiles(dirPath)
})

console.log(performanceMonitor.getMetrics())
```

### 缓存

```typescript
import { Cache, memoize, debounce, throttle } from '@/utils'

const cache = new Cache<string>(60000)
cache.set('key', 'value')
const value = cache.get('key')

const debouncedFn = debounce(() => {
  console.log('Debounced!')
}, 300)
```
