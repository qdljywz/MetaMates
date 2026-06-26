/**
 * Per-CLI skill directory layouts (read + provision).
 *
 * Modern CLIs (Qwen, Gemini, CodeBuddy, Codex, …) use Agent Skills layout:
 *   .{cli}/skills/{name}/SKILL.md
 * Claude Code uses flat files:
 *   .claude/skills/{name}.md
 */

import * as path from 'path'

export type SkillLayoutKind = 'flat' | 'folder'

export interface BackendSkillLayout {
  dotFolder: string
  kind: SkillLayoutKind
}

/** Backends with hand-authored templates under inits/{lang}/. */
export const INITS_SKILL_BACKENDS = ['claude', 'codebuddy', 'gemini'] as const

/**
 * Resolve dot-folder + layout for any ACP backend id.
 * Unknown ids follow Agent Skills convention: .{backendId}/skills/{name}/SKILL.md
 */
export function getBackendSkillLayout(backendId: string): BackendSkillLayout {
  if (backendId === 'claude') {
    return { dotFolder: '.claude', kind: 'flat' }
  }
  return { dotFolder: `.${backendId}`, kind: 'folder' }
}

/**
 * Relative skill path inside a workspace for a backend + command.
 */
export function getWorkspaceSkillRelativePath(backendId: string, skillName: string): string {
  const layout = getBackendSkillLayout(backendId)
  if (layout.kind === 'flat') {
    return path.join(layout.dotFolder, 'skills', `${skillName}.md`)
  }
  return path.join(layout.dotFolder, 'skills', skillName, 'SKILL.md')
}

/**
 * Dedicated inits template path when we ship one for this backend.
 */
export function getInitsSkillRelativePath(backendId: string, skillName: string): string | null {
  if (backendId === 'claude') return path.join('.claude', 'skills', `${skillName}.md`)
  if (backendId === 'codebuddy') return path.join('.codebuddy', 'skills', skillName, 'SKILL.md')
  if (backendId === 'gemini') return path.join('.gemini', 'skills', skillName, 'SKILL.md')
  if (backendId === 'metamates') return path.join('.metamates', 'skills', `${skillName}.md`)
  return null
}

/** Canonical folder-format source in inits (richest templates). */
export function getCanonicalInitsSourceRelativePath(skillName: string): string {
  return path.join('.codebuddy', 'skills', skillName, 'SKILL.md')
}

/** Flat Claude fallback in inits when synthesizing is unnecessary. */
export function getClaudeInitsFallbackRelativePath(skillName: string): string {
  return path.join('.claude', 'skills', `${skillName}.md`)
}

/**
 * Resolve skill paths to try when reading, highest priority first.
 */
export function resolveSkillPaths(
  workspacePath: string,
  skillName: string,
  backendId?: string | null,
): string[] {
  const paths: string[] = []

  if (backendId) {
    paths.push(path.join(workspacePath, getWorkspaceSkillRelativePath(backendId, skillName)))
  }

  // Neutral project skills (optional override layer)
  paths.push(path.join(workspacePath, '.metamates', 'skills', `${skillName}.md`))

  // Codex also scans .agents/skills in some builds
  if (backendId === 'codex') {
    paths.push(path.join(workspacePath, '.agents', 'skills', skillName, 'SKILL.md'))
  }

  // Legacy fallback — older workspaces only had Claude flat skills
  if (backendId !== 'claude') {
    paths.push(path.join(workspacePath, '.claude', 'skills', `${skillName}.md`))
  }

  return [...new Set(paths)]
}

/** Dot-folders that may hold slash-command skills (for bulk sync). */
export const SKILL_DOT_FOLDERS = [
  '.claude',
  '.codebuddy',
  '.gemini',
  '.metamates',
  '.qwen',
  '.codex',
  '.agents',
] as const

/** @deprecated Use getWorkspaceSkillRelativePath — kept for older imports. */
export const BACKEND_SKILL_LAYOUTS: Record<
  string,
  (workspacePath: string, skillName: string) => string[]
> = {
  claude: (root, name) => [path.join(root, getWorkspaceSkillRelativePath('claude', name))],
  codebuddy: (root, name) => [path.join(root, getWorkspaceSkillRelativePath('codebuddy', name))],
  gemini: (root, name) => [path.join(root, getWorkspaceSkillRelativePath('gemini', name))],
}
