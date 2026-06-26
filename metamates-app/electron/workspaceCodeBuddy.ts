/**
 * Anchor CodeBuddy project config inside the Metamates vault (not ~/.codebuddy/projects).
 * User-facing memory mirror: 04_情报与连接/记忆索引.md (see intelligencePaths.ts).
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  ensureIntelligenceMemoryLayout,
  getUserMemoryIndexRelative,
  type EnsureIntelligenceMemoryResult,
  type WorkspaceLanguage,
} from './shared/intelligencePaths'

export interface CodeBuddyWorkspaceConfigResult {
  success: boolean
  created: boolean
  path?: string
  error?: string
}

/** Env vars injected when spawning CodeBuddy so memory stays vault-local. */
export function buildCodeBuddySpawnEnv(workspacePath: string): Record<string, string> {
  return {
    CODEBUDDY_PROJECT_DIR: workspacePath,
    CODEBUDDY_TEAM_MEMORY_ENABLED: '1',
    CODEBUDDY_MEMORY_ENABLED: '1',
  }
}

/**
 * Ensure `.codebuddy/settings.json` enables team memory in the workspace.
 * Merges with existing file — does not overwrite user hooks/rules.
 */
export function ensureWorkspaceCodeBuddyConfig(workspacePath: string): CodeBuddyWorkspaceConfigResult {
  if (!workspacePath?.trim()) {
    return { success: false, created: false, error: 'No workspace path' }
  }

  const codebuddyDir = path.join(workspacePath, '.codebuddy')
  const settingsPath = path.join(codebuddyDir, 'settings.json')

  try {
    fs.mkdirSync(codebuddyDir, { recursive: true })

    let existing: Record<string, unknown> = {}
    if (fs.existsSync(settingsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
      } catch {
        existing = {}
      }
    }

    const memory = (existing.memory && typeof existing.memory === 'object'
      ? existing.memory
      : {}) as Record<string, unknown>
    const teamMemory = (memory.teamMemory && typeof memory.teamMemory === 'object'
      ? memory.teamMemory
      : {}) as Record<string, unknown>

    const alreadyEnabled = teamMemory.enabled === true
    const merged = {
      ...existing,
      memory: {
        ...memory,
        enabled: memory.enabled !== false,
        teamMemory: {
          ...teamMemory,
          enabled: true,
        },
      },
    }

    if (!alreadyEnabled || !fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')
    }

    ensureCodeBuddyProjectMemoryPointer(workspacePath, 'zh')

    if (!alreadyEnabled || !fs.existsSync(settingsPath)) {
      return { success: true, created: true, path: settingsPath }
    }

    return { success: true, created: false, path: settingsPath }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, created: false, error: message }
  }
}

/** Point CodeBuddy at vault intelligence memory — not user-home MEMORY.md. */
function ensureCodeBuddyProjectMemoryPointer(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh',
): void {
  const memoryIndexRel = getUserMemoryIndexRelative(language)
  const pointerPath = path.join(workspacePath, '.codebuddy', 'CODEBUDDY.md')
  const pointerBlock = language === 'en'
    ? `\n## Metamates user memory\n- Canonical index: \`${memoryIndexRel}\` (write summaries here)\n- Reference notes: \`04_Intelligence/Reference/\`\n- Do NOT use ~/.codebuddy/projects/... for user content\n`
    : `\n## Metamates 用户记忆\n- 权威索引：\`${memoryIndexRel}\`（用户记忆摘要写这里）\n- 参考条目：\`04_情报与连接/参考/\`\n- 禁止把用户内容写到 ~/.codebuddy/projects/...\n`

  fs.mkdirSync(path.dirname(pointerPath), { recursive: true })
  if (!fs.existsSync(pointerPath)) {
    fs.writeFileSync(
      pointerPath,
      `# CodeBuddy — ${path.basename(workspacePath)}\n${pointerBlock}`,
      'utf-8',
    )
    return
  }

  const existing = fs.readFileSync(pointerPath, 'utf-8')
  if (!existing.includes('Metamates') && !existing.includes('记忆索引') && !existing.includes('Memory_Index')) {
    fs.writeFileSync(pointerPath, `${existing.trimEnd()}\n${pointerBlock}`, 'utf-8')
  }
}

export function ensureWorkspaceVaultMemory(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh',
): { codebuddy: CodeBuddyWorkspaceConfigResult; intelligence: EnsureIntelligenceMemoryResult } {
  return {
    intelligence: ensureIntelligenceMemoryLayout(workspacePath, language),
    codebuddy: ensureWorkspaceCodeBuddyConfig(workspacePath),
  }
}
