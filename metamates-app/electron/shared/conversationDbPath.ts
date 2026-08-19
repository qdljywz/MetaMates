import * as path from 'path'
import { normalizeWorkspacePath } from './workspacePath'

/** Vault-local MetaMates metadata (chat DB, not Claude CLI transcripts). */
export const WORKSPACE_CHAT_DIR = '.metamates'

export const CONVERSATIONS_SQLITE = 'conversations.sqlite'

/**
 * Resolve the MetaMates conversation SQLite file.
 * Bound workspace → `{vault}/.metamates/conversations.sqlite` (shared by dev and packaged).
 * No workspace → `{userData}/conversations.sqlite` (first-run / probes).
 */
export function resolveConversationSqlitePath(options: {
  workspacePath?: string
  userDataDir: string
  override?: string
}): string {
  if (options.override?.trim()) return path.resolve(options.override.trim())
  const workspace = normalizeWorkspacePath(options.workspacePath || '')
  if (workspace) {
    return path.join(workspace, WORKSPACE_CHAT_DIR, CONVERSATIONS_SQLITE)
  }
  return path.join(options.userDataDir, CONVERSATIONS_SQLITE)
}
