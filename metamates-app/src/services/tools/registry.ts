import { BaseTool, ToolSchema, ToolExecutionContext, FunctionCall, FunctionResponse } from './base'
import { fileSystemTools } from './fileSystem'
import { analysisTools } from './analysis'

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map()
  
  constructor() {
    this.registerTools([...fileSystemTools, ...analysisTools])
  }
  
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.schema.name, tool)
  }
  
  registerTools(tools: BaseTool[]): void {
    tools.forEach(tool => this.registerTool(tool))
  }
  
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name)
  }
  
  getAllTools(): BaseTool[] {
    return Array.from(this.tools.values())
  }
  
  getToolSchemas(): ToolSchema[] {
    return this.getAllTools().map(tool => tool.schema)
  }
  
  getToolsByCategory(category: string): BaseTool[] {
    return this.getAllTools().filter(tool => tool.schema.category === category)
  }
  
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }
}

export const toolRegistry = new ToolRegistry()

export class ToolExecutor {
  private registry: ToolRegistry
  
  constructor(registry: ToolRegistry = toolRegistry) {
    this.registry = registry
  }
  
  async executeFunctionCall(
    call: FunctionCall,
    context: ToolExecutionContext
  ): Promise<FunctionResponse> {
    const tool = this.registry.getTool(call.name)
    
    if (!tool) {
      return {
        name: call.name,
        response: {
          success: false,
          error: `Unknown tool: ${call.name}`,
        },
      }
    }
    
    const validation = tool.validateParams(call.args)
    if (!validation.valid) {
      return {
        name: call.name,
        response: {
          success: false,
          error: validation.error,
        },
      }
    }
    
    if (tool.shouldConfirmExecute(call.args) && context.userConfirmation) {
      const message = tool.getConfirmationMessage(call.args)
      const confirmed = await context.userConfirmation(message)
      if (!confirmed) {
        return {
          name: call.name,
          response: {
            success: false,
            error: 'User cancelled the operation',
          },
        }
      }
    }
    
    try {
      const result = await tool.execute(call.args, context)
      return {
        name: call.name,
        response: {
          success: result.success,
          data: result.data,
          error: result.error,
        },
      }
    } catch (error: any) {
      return {
        name: call.name,
        response: {
          success: false,
          error: error.message || 'Unknown error',
        },
      }
    }
  }
  
  async executeMultiple(
    calls: FunctionCall[],
    context: ToolExecutionContext
  ): Promise<FunctionResponse[]> {
    const results: FunctionResponse[] = []
    
    for (const call of calls) {
      const result = await this.executeFunctionCall(call, context)
      results.push(result)
    }
    
    return results
  }
  
  getAvailableToolsDescription(): string {
    const tools = this.registry.getAllTools()
    let description = 'Available tools:\n\n'
    
    tools.forEach(tool => {
      const schema = tool.schema
      description += `### ${schema.name}\n`
      description += `${schema.description}\n`
      description += `Category: ${schema.category}\n`
      description += `Requires confirmation: ${schema.requiresConfirmation ? 'Yes' : 'No'}\n`
      
      if (schema.parameters.length > 0) {
        description += 'Parameters:\n'
        schema.parameters.forEach(param => {
          description += `  - ${param.name} (${param.type}${param.required ? ', required' : ', optional'}): ${param.description}\n`
        })
      }
      description += '\n'
    })
    
    return description
  }
}

export const toolExecutor = new ToolExecutor()

export function generateToolPrompt(): string {
  const tools = toolRegistry.getToolSchemas()
  
  let prompt = `You have access to the following tools. You can use them to help the user.

## Tool Usage Format

When you need to use a tool, output it in this format:

\`\`\`tool
{
  "name": "tool_name",
  "args": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`

## Available Tools

`
  
  tools.forEach(tool => {
    prompt += `### ${tool.name}\n`
    prompt += `${tool.description}\n\n`
    
    if (tool.parameters.length > 0) {
      prompt += `Parameters:\n`
      tool.parameters.forEach(param => {
        prompt += `- **${param.name}** (${param.type}${param.required ? ', required' : ''}): ${param.description}\n`
      })
      prompt += '\n'
    }
  })
  
  prompt += `
## Important Rules

1. **Always use tools when appropriate**: When the user asks to read, write, search, or analyze files, use the corresponding tool.
2. **One tool at a time**: Execute one tool, wait for the result, then decide if you need more tools.
3. **Be transparent**: Tell the user what tool you're using and why.
4. **Handle errors gracefully**: If a tool fails, explain the error to the user and suggest alternatives.
5. **Confirm destructive operations**: Tools that modify or delete files require user confirmation.

## Example Usage

User: "帮我读取项目计划文件"
Assistant: 我来帮你读取项目计划文件。

\`\`\`tool
{
  "name": "read_file",
  "args": {
    "file_path": "项目计划.md"
  }
}
\`\`\`

[Tool execution result will be shown here]

Based on the file content, I can now help you with...
`
  
  return prompt
}
