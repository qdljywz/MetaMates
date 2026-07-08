# IPC 通信协议设计

> 创建时间：2026-03-17
> 目标：定义 Electron 主进程和渲染进程之间的 IPC 通信协议

---

## 一、消息类型定义

### 1.1 主进程 → 渲染进程

```typescript
interface IPCMessage {
  type: 'command' | 'response' | 'tool_call' | 'tool_result' | 'error'
  payload: any
}

interface CommandMessage extends IPCMessage {
  type: 'command'
  payload: {
    command: string
    args?: Record<string, any>
  }
}

interface ToolCallMessage extends IPCMessage {
  type: 'tool_call'
  payload: {
    tool: string
    args: Record<string, any>
  }
}

interface ToolResultMessage extends IPCMessage {
  type: 'tool_result'
  payload: {
    tool: string
    success: boolean
    result?: any
    error?: string
  }
}

interface ErrorMessage extends IPCMessage {
  type: 'error'
  payload: {
    message: string
    code?: string
  }
}
```

### 1.2 渲染进程 → 主进程

```typescript
interface ChatMessage extends IPCMessage {
  type: 'chat'
  payload: {
    message: string
    context?: string
  }
}

interface CancelToolMessage extends IPCMessage {
  type: 'cancel_tool'
  payload: {
    tool: string
  }
}

interface LoadHistoryMessage extends IPCMessage {
  type: 'load_history'
  payload?: any
}
```

---

## 二、命令定义

### 2.1 Gemini CLI 命令

| 命令 | 参数 | 说明 |
|------|------|------|
| chat | message: string | 发送聊天消息 |
| stream | message: string | 发送流式消息 |
| cancel | - | 取消当前消息 |

### 2.2 MetaMates 命令

| 命令 | 参数 | 说明 |
|------|------|------|
| gemini_chat | message: string | 发送消息到 Gemini CLI |
| gemini_stream | message: string | 发送流式消息到 Gemini CLI |
| cancel_gemini | - | 取消 Gemini CLI 当前操作 |

---

## 三、工具调用流程

### 3.1 工具调用流程

```
渲染进程                    主进程
     ↓ 发送命令
     ↓
Gemini CLI                 执行工具
     ↓ 返回结果
     ↓
主进程                    拦截结果
     ↓ 转换为 MetaMates API
     ↓
渲染进程                    显示结果
```

### 3.2 工具调用示例

**场景：用户发送"帮我创建一个项目计划"**

1. 渲染进程发送命令：
```typescript
{
  type: 'command',
  payload: {
    command: 'gemini_chat',
    args: {
      message: '帮我创建一个项目计划'
    }
  }
}
```

2. 主进程转发到 Gemini CLI

3. Gemini CLI 调用工具（例如：write_file）

4. Gemini CLI 返回结果：
```json
{
  "type": "tool_call",
  "tool": "write_file",
  "args": {
    "file_path": "项目计划.md",
    "content": "# 项目计划..."
  },
  "success": true
}
```

5. 主进程拦截工具调用

6. 主进程转换为 MetaMates API 调用：
```typescript
await window.electronAPI.writeFile(filePath, content)
```

7. 渲染进程显示结果

---

## 四、错误处理

### 4.1 错误类型

| 错误类型 | 处理方式 |
|---------|----------|
| Gemini CLI 未运行 | 提示用户启动 Gemini CLI |
| 工具调用失败 | 显示错误提示，允许重试 |
| IPC 通信失败 | 记录日志，显示友好错误提示 |
| 进程崩溃 | 自动重启进程，恢复对话状态 |

### 4.2 错误恢复

| 恢复策略 | 说明 |
|---------|------|
| 自动重试 | 工具调用失败时自动重试（最多 3 次） |
| 进程重启 | Gemini CLI 崩溃时自动重启 |
| 用户手动恢复 | 提供重试按钮 |

---

## 五、上下文管理

### 5.1 对话历史

```typescript
interface ConversationHistory {
  conversations: Conversation[]
  currentId: string
  
  add(message: string): void
  get(id: string): Conversation | undefined
  getCurrent(): Conversation | undefined
  getAll(): Conversation[]
  delete(id: string): void
}
```

### 5.2 上下文窗口

```typescript
interface ContextWindow {
  messages: Message[]
  maxSize: number
  add(message: Message): void
  get(): Message[]
  clear(): void
}
```

---

## 六、实现步骤

### 阶段 1：创建 Gemini CLI 包装器

**Week 1**：
- [ ] 创建 GeminiCLIManager 类
  - 启动/停止 Gemini CLI
  - 监控进程状态
  - 处理进程异常
- [ ] 实现 IPC 通信
  - 主进程 ↔ Gemini CLI
  - 消息发送和接收
- [ ] 实现工具调用拦截
  - 拦截 Gemini CLI 的工具调用
  - 转换为 MetaMates API
- [ ] 编写单元测试
  - 测试进程管理器
  - 测试 IPC 通信
  - 测试工具调用拦截

---

## 七、技术细节

### 7.1 Gemini CLI 输出格式

Gemini CLI 的输出是 JSON 格式，需要解析：

```typescript
interface GeminiOutput {
  type: 'text' | 'tool_call' | 'error' | 'stream'
  content?: string
  tool?: {
    name: string
    args: Record<string, any>
  }
  error?: {
    message: string
    code?: string
  }
}
```

### 7.2 工具调用映射

| Gemini CLI 工具 | MetaMates API | 说明 |
|----------------|----------------|------|
| read_file | readFile | 读取文件内容 |
| write_file | writeFile | 创建或覆盖文件 |
| append_file | appendFile | 在文件末尾追加内容 |
| delete_file | deleteFile | 删除文件 |
| list_files | listFiles | 列出目录中的文件 |
| search_content | searchContent | 搜索文件内容 |

---

## 八、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|------|
| IPC 通信复杂度 | 中 | 设计清晰的协议，充分测试 |
| 进程管理复杂度 | 中 | 使用成熟的进程管理库 |
| 工具调用映射不完整 | 低 | 逐步实现，优先核心工具 |
| 性能影响 | 中 | 添加性能监控，及时优化 |

---

## 九、成功标准

每个阶段完成后，需要满足以下标准：

1. **功能完整性**：所有计划功能都已实现
2. **代码质量**：TypeScript 编译通过，单元测试通过
3. **性能**：响应时间在可接受范围内
4. **集成测试**：与现有功能集成测试通过
5. **文档**：相关文档已更新

---

> 本协议由 AI Agent 自动生成
> 请审阅并确认实施计划
