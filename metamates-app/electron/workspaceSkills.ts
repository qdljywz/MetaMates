/**
 * Sync slash-command skill files from inits template into user workspace.
 * Called on init/reinit and when new CLIs are detected.
 */

import * as fs from 'fs'
import * as path from 'path'
import { resolveInitsRoot } from './shared/appPaths'
import { COMMAND_SKILL_NAMES } from './shared/skillCatalog'
import {
  getBackendSkillLayout,
  getCanonicalInitsSourceRelativePath,
  getClaudeInitsFallbackRelativePath,
  getInitsSkillRelativePath,
  getWorkspaceSkillRelativePath,
} from './shared/skillLayouts'
import { ensureWorkspaceCodeBuddyConfig } from './workspaceCodeBuddy'
import { ensureIntelligenceMemoryLayout } from './shared/intelligencePaths'

export interface EnsureSkillsResult {
  success: boolean
  created: string[]
  skipped: string[]

  error?: string
}

/**
 * Resolve inits/{lang} root (dev vs packaged) — uses resolveInitsRoot() from appPaths.
 */
export function resolveInitsLangPath(language: 'zh' | 'en'): string {
  const langDir = language === 'en' ? 'en' : 'zh'
  return path.join(resolveInitsRoot(), langDir)
}

/**
 * Pick inits source file for provisioning a backend skill.
 * Dedicated template → canonical CodeBuddy folder → Claude flat fallback.
 */
function resolveInitsSourcePath(
  initsRoot: string,
  backendId: string,
  skillName: string,
): string | null {
  const dedicatedRel = getInitsSkillRelativePath(backendId, skillName)
  if (dedicatedRel) {
    const dedicated = path.join(initsRoot, dedicatedRel)
    if (fs.existsSync(dedicated)) return dedicated
  }

  const layout = getBackendSkillLayout(backendId)
  if (layout.kind === 'folder') {
    const canonical = path.join(initsRoot, getCanonicalInitsSourceRelativePath(skillName))
    if (fs.existsSync(canonical)) return canonical
  }

  const claudeFlat = path.join(initsRoot, getClaudeInitsFallbackRelativePath(skillName))
  if (fs.existsSync(claudeFlat)) return claudeFlat

  return null
}

/**
 * Copy missing slash-command skill files for the given backends only.
 * Does not bulk-copy entire dot directories — each CLI folder is created
 * on demand when that backend's skill files are written.
 */
export function ensureWorkspaceSkills(
  workspacePath: string,
  language: 'zh' | 'en' = 'zh',
  backendIds: readonly string[] = [],
): EnsureSkillsResult {
  const created: string[] = []
  const skipped: string[] = []

  if (backendIds.length === 0) {
    return { success: true, created, skipped }
  }

  try {
    const initsRoot = resolveInitsLangPath(language)
    if (!fs.existsSync(initsRoot)) {
      return { success: false, created, skipped, error: `Inits not found: ${initsRoot}` }
    }

    const backends = new Set(backendIds)

    for (const backendId of backends) {
      for (const skillName of COMMAND_SKILL_NAMES) {
        const destRel = getWorkspaceSkillRelativePath(backendId, skillName)
        const dest = path.join(workspacePath, destRel)

        const src = resolveInitsSourcePath(initsRoot, backendId, skillName)
        if (!src) {
          skipped.push(destRel)
          continue
        }

        if (fs.existsSync(dest)) {
          skipped.push(destRel)
          continue
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
        created.push(destRel)
      }
    }

    return { success: true, created, skipped }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, created, skipped, error: message }
  }
}

/**
 * When a CLI is detected, provision skills under that CLI's native folder
 * (e.g. .qwen/skills/today/SKILL.md), synthesized from CodeBuddy templates when needed.
 */
export function ensureSkillsForDetectedBackend(
  workspacePath: string,
  language: 'zh' | 'en',
  backendId: string,
): EnsureSkillsResult {
  return ensureWorkspaceSkills(workspacePath, language, [backendId])
}

/**
 * Provision slash skills for every currently detected CLI backend.
 */
export function syncAllWorkspaceSkills(
  workspacePath: string,
  language: 'zh' | 'en',
  detectedBackendIds: readonly string[],
): EnsureSkillsResult {
  const intel = ensureIntelligenceMemoryLayout(workspacePath, language)
  if (intel.created.length > 0) {
    console.log('[INTEL] Provisioned user memory layout:', intel.created.join(', '))
  }
  if (detectedBackendIds.includes('codebuddy')) {
    ensureWorkspaceCodeBuddyConfig(workspacePath)
  }
  const skills = ensureWorkspaceSkills(workspacePath, language, detectedBackendIds)
  if (intel.created.length > 0) {
    return { ...skills, created: [...intel.created, ...skills.created] }
  }
  return skills
}
