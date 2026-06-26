import { ToolSchema, ToolParameter } from './base'

export interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description: string
        enum?: string[]
      }>
      required: string[]
    }
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolCallResult {
  tool_call_id: string
  role: 'tool'
  name: string
  content: string
}

function mapParameterType(type: ToolParameter['type']): string {
  const typeMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'array': 'array',
    'object': 'object',
  }
  return typeMap[type] || 'string'
}

export function convertToOpenAITools(schemas: ToolSchema[]): OpenAIToolDefinition[] {
  return schemas.map(schema => ({
    type: 'function' as const,
    function: {
      name: schema.name,
      description: schema.description,
      parameters: {
        type: 'object',
        properties: schema.parameters.reduce((acc, param) => {
          acc[param.name] = {
            type: mapParameterType(param.type),
            description: param.description,
          }
          if (param.default !== undefined) {
            acc[param.name].description += ` (默认: ${param.default})`
          }
          return acc
        }, {} as Record<string, { type: string; description: string }>),
        required: schema.parameters
          .filter(p => p.required)
          .map(p => p.name),
      },
    },
  }))
}

export function parseToolCallArguments(argsString: string): Record<string, unknown> {
  try {
    return JSON.parse(argsString)
  } catch {
    console.error('Failed to parse tool call arguments:', argsString)
    return {}
  }
}

export function formatToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }
  if (result === null || result === undefined) {
    return 'null'
  }
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

export const AGENT_SYSTEM_PROMPT = `你是一个智能助手，具有完整的文件操作能力。你可以使用工具来帮助用户完成任务。

## 核心原则

1. **主动执行** - 不要只是建议，要实际使用工具执行操作
2. **多步规划** - 对于复杂任务，分解为多个步骤执行
3. **验证结果** - 执行操作后验证是否成功
4. **错误恢复** - 如果操作失败，尝试其他方法或询问用户

## 工作流程

当用户发送消息时：
1. 分析用户意图
2. 决定需要使用哪些工具
3. 按顺序执行工具调用
4. 根据结果决定下一步行动
5. 向用户报告最终结果

## 重要规则

- 当用户说"创建文件"、"写一个"时，使用 write_file 工具
- 当用户说"读取"、"查看"时，使用 read_file 工具
- 当用户说"搜索"、"查找"时，使用 search_content 工具
- 当用户说"总结"、"分析"时，先读取内容，再进行分析
- 对于危险操作（删除、移动），先确认用户意图

## 文件路径处理

- 文件路径可以是相对路径（相对于工作区根目录）
- 也可以是绝对路径
- 如果用户只提供文件名，自动在工作区根目录创建

## 双向链接

- 使用 [[文件名]] 格式创建双向链接
- 双向链接指向 .md 文件
- 如果链接的文件不存在，提示将创建新文件
`

export const AVAILABLE_TOOLS_PROMPT = `## 可用工具

### 文件操作

- **read_file**: 读取文件内容
- **write_file**: 创建或覆盖写入文件
- **append_file**: 在文件末尾追加内容
- **delete_file**: 删除文件（危险操作）
- **list_files**: 列出目录中的文件
- **search_content**: 搜索文件内容
- **move_file**: 移动文件
- **rename_file**: 重命名文件
- **batch_create_files**: 批量创建文件

### 分析工具

- **summarize**: 总结内容
- **analyze**: 深入分析
- **extract_tasks**: 提取待办任务
- **find_links**: 查找链接和标签
- **generate_report**: 生成工作区报告
`
