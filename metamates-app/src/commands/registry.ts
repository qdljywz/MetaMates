import { Command, COMMANDS } from './definitions'
import { commandProcessor, CommandContext, CommandResult } from '../services/commands/processor'

export type CommandExecutor = (context: CommandContext, args?: string) => Promise<CommandResult>

interface CommandRegistryEntry {
  command: Command
  executor: CommandExecutor
}

class CommandRegistry {
  private registry: Map<string, CommandRegistryEntry> = new Map()

  constructor() {
    this.registerDefaultCommands()
  }

  private registerDefaultCommands() {
    COMMANDS.forEach(cmd => {
      this.register(cmd, this.createExecutor(cmd))
    })
  }

  private createExecutor(cmd: Command): CommandExecutor {
    return async (context: CommandContext, args?: string): Promise<CommandResult> => {
      const input = args || cmd.prompt || cmd.id
      
      return commandProcessor.execute(input, context)
    }
  }

  register(command: Command, executor: CommandExecutor) {
    this.registry.set(command.id, { command, executor })
  }

  async execute(commandId: string, context: CommandContext, args?: string): Promise<CommandResult> {
    const entry = this.registry.get(commandId)
    
    if (!entry) {
      return {
        success: false,
        error: `Unknown command: ${commandId}`,
      }
    }

    return entry.executor(context, args)
  }

  getCommand(commandId: string): Command | undefined {
    return this.registry.get(commandId)?.command
  }

  getAllCommands(): Command[] {
    return Array.from(this.registry.values()).map(entry => entry.command)
  }

  getCommandsByCategory(category: Command['category']): Command[] {
    return this.getAllCommands().filter(cmd => cmd.category === category)
  }
}

export const commandRegistry = new CommandRegistry()
export type { Command }
