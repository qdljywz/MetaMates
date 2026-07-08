import { buildWorkspacePathHints, normalizeSkillFilePaths, type WorkspaceLanguage } from './workspacePathHints'
import { buildWritePolicyBlock } from './slashWritePolicy'
import { formatNowInTimezone, getEffectiveTimezone, getTodayDateString } from '../constants/paths'

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
  timezone?: string
}): string {
  const { cmd, language, workspacePath, skillContent, userInput = '', timezone } = options

  let body = cmd.prompt
  if (skillContent?.trim()) {
    body = stripSkillFrontmatter(normalizeSkillFilePaths(skillContent, language))
  } else if (cmd.inputMode === 'required' || cmd.inputMode === 'optional') {
    body = cmd.prompt.replace('{INPUT}', userInput.trim())
  }

  const pathHints = buildWorkspacePathHints(language, workspacePath)
  const writePolicy = buildWritePolicyBlock(cmd.id, language)
  const effectiveTimezone = timezone || getEffectiveTimezone()
  const nowInTimezone = formatNowInTimezone(effectiveTimezone)
  const todayInTimezone = getTodayDateString(effectiveTimezone)
  const timezoneContext = language === 'en'
    ? `Time policy:\n- Effective timezone: ${effectiveTimezone}\n- Current local datetime: ${nowInTimezone}\n- Today (YYYY-MM-DD): ${todayInTimezone}\n- Date-sensitive paths (e.g. YYYY-MM-DD PLAN.md) MUST use this timezone.`
    : `时间策略：\n- 生效时区：${effectiveTimezone}\n- 当前本地时间：${nowInTimezone}\n- 今日日期（YYYY-MM-DD）：${todayInTimezone}\n- 涉及日期路径（如 YYYY-MM-DD PLAN.md）必须按此时区计算。`

  const parts = [timezoneContext, pathHints, writePolicy, body]

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
