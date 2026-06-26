import { masterControlService } from '../masterControl'
import { COMMANDS, type Command } from '../../commands/definitions'
import { getAcpRedirectMessage } from './acpRedirect'

export interface CommandResult {
  success: boolean
  content?: string
  error?: string
}

export interface CommandContext {
  workspacePath: string
  files: import('../../types/electron').FileInfo[]
  currentFile?: string
  fileContents: { name: string; content: string }[]
}

export type CommandHandler = (context: CommandContext, args?: string) => Promise<CommandResult>

export class CommandProcessor {
  private commands: Map<string, (context: CommandContext, args?: string) => Promise<CommandResult>>

  constructor() {
    this.commands = new Map()
    this.registerCommands()
  }

  private registerCommands() {
    this.register('context', this.handleContext.bind(this))
    this.register('today', this.handleToday.bind(this))
    this.register('closeday', this.handleCloseDay.bind(this))
    this.register('schedule', this.handleSchedule.bind(this))
    this.register('trace', this.handleTrace.bind(this))
    this.register('connect', this.handleConnect.bind(this))
    this.register('challenge', this.handleChallenge.bind(this))
    this.register('ghost', this.handleGhost.bind(this))
    this.register('ideas', this.handleIdeas.bind(this))
    this.register('graduate', this.handleGraduate.bind(this))
    this.register('drift', this.handleDrift.bind(this))
    this.register('emerge', this.handleEmerge.bind(this))
    this.register('sync', this.handleSync.bind(this))
  }

  private register(name: string, handler: (context: CommandContext, args?: string) => Promise<CommandResult>) {
    this.commands.set(name, handler)
  }

  public async execute(command: string, context: CommandContext): Promise<CommandResult> {
    const parts = command.trim().split(/\s+/)
    const commandName = parts[0].toLowerCase().replace(/^\//, '')
    const args = parts.slice(1).join(' ')

    const handler = this.commands.get(commandName)
    if (!handler) {
      const commandDef = COMMANDS.find(cmd => cmd.id === `/${commandName}`)
      if (commandDef) {
        return this.handleGenericCommand(commandDef, context, args)
      }
      
      return {
        success: false,
        error: `未知命令: ${commandName}。可用命令: ${COMMANDS.map(c => c.id).join(', ')}`,
      }
    }

    try {
      return await handler(context, args)
    } catch (error: any) {
      return {
        success: false,
        error: `命令执行失败: ${error.message}`,
      }
    }
  }

  public getAvailableCommands(): string[] {
    return Array.from(this.commands.keys())
  }

  private buildContextPrompt(context: CommandContext): string {
    const fileContents = context.fileContents
      .slice(0, 10)
      .map(f => `=== ${f.name} ===\n${f.content.slice(0, 2000)}`)
      .join('\n\n')
    
    return `
工作区：${context.workspacePath}

文件内容：
${fileContents}
`
  }

  private async callAI(_prompt: string, _context: CommandContext): Promise<string> {
    return getAcpRedirectMessage()
  }

  private async handleGenericCommand(command: Command, context: CommandContext, args?: string): Promise<CommandResult> {
    let prompt = command.prompt
    if (args) {
      prompt = prompt.replace('[topic]', args).replace('[question]', args).replace('[topic A] and [topic B]', args)
    }
    
    const content = await this.callAI(prompt, context)
    return { success: true, content }
  }

  private async handleContext(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/context')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleToday(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/today')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleCloseDay(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/closeday')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleSchedule(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/schedule')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleTrace(context: CommandContext, args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/trace')!
    const prompt = commandDef.prompt.replace('[topic]', args || '知识管理')
    const content = await this.callAI(prompt, context)
    return { success: true, content }
  }

  private async handleConnect(context: CommandContext, args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/connect')!
    const prompt = commandDef.prompt.replace('[topic A] and [topic B]', args || '项目 和 日记')
    const content = await this.callAI(prompt, context)
    return { success: true, content }
  }

  private async handleChallenge(context: CommandContext, args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/challenge')!
    const prompt = commandDef.prompt.replace('[topic]', args || '当前观点')
    const content = await this.callAI(prompt, context)
    return { success: true, content }
  }

  private async handleGhost(context: CommandContext, args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/ghost')!
    const prompt = commandDef.prompt.replace('[question]', args || '如何更好地管理知识？')
    const content = await this.callAI(prompt, context)
    return { success: true, content }
  }

  private async handleIdeas(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/ideas')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleGraduate(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/graduate')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleDrift(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/drift')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleEmerge(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/emerge')!
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }

  private async handleSync(context: CommandContext, _args?: string): Promise<CommandResult> {
    const commandDef = COMMANDS.find(cmd => cmd.id === '/sync')!
    
    try {
      await masterControlService.loadMasterControl(context.workspacePath)
      await masterControlService.updateContext(context.workspacePath, context.files)
    } catch (error) {
      console.log('Master Control not available:', error)
    }
    
    const content = await this.callAI(commandDef.prompt, context)
    return { success: true, content }
  }
}

export const commandProcessor = new CommandProcessor()
