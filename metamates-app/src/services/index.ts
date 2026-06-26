/**
 * Active service exports. AI commands run via ACP Agent panel — not built-in API.
 */
export { commandProcessor } from './commands/processor'
export type { CommandContext, CommandResult, CommandHandler } from './commands/processor'
export { getAcpRedirectMessage } from './commands/acpRedirect'
