import { buildWorkspacePathHints, normalizeSkillFilePaths, type WorkspaceLanguage } from './workspacePathHints'
import { buildWritePolicyBlock } from './slashWritePolicy'

export interface SlashPromptCommand {
  id: string
  prompt: string
  inputMode?: 'none' | 'optional' | 'required'
}

/**
 * Strip YAML frontmatter from a skill markdown file.
 */
export function stripSkillFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/)
  return match ? content.slice(match[0].length).trim() : content.trim()
}

/**
 * Assemble the final slash prompt: path map + write policy + skill body + optional user input.
 */
export function assembleSlashPrompt(options: {
  cmd: SlashPromptCommand
  language: WorkspaceLanguage
  workspacePath?: string
  skillContent?: string | null
  userInput?: string
}): string {
  const { cmd, language, workspacePath, skillContent, userInput = '' } = options

  let body = cmd.prompt
  if (skillContent?.trim()) {
    body = stripSkillFrontmatter(normalizeSkillFilePaths(skillContent, language))
  } else if (cmd.inputMode === 'required' || cmd.inputMode === 'optional') {
    body = cmd.prompt.replace('{INPUT}', userInput.trim())
  }

  const pathHints = buildWorkspacePathHints(language, workspacePath)
  const writePolicy = buildWritePolicyBlock(cmd.id, language)
  const parts = [pathHints, writePolicy, body]

  const trimmedInput = userInput.trim()
  if (trimmedInput && skillContent?.trim() && (cmd.inputMode === 'optional' || cmd.inputMode === 'required')) {
    parts.push(
      language === 'en'
        ? `User supplemental input:\n${trimmedInput}`
        : `用户补充：\n${trimmedInput}`,
    )
  }

  return parts.filter(Boolean).join('\n\n')
}
