/**
 * User-facing memory lives in 04_情报与连接 — not in ~/.codebuddy or CLI-only caches.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  createIntelligenceHomeContent,
  createUserMemoryIndexContent,
  getIntelligenceReferenceDirRelative,
  getUserMemoryIndexRelative,
  type WorkspaceLanguage,
} from './intelligencePathLayout'

export type { WorkspaceLanguage } from './intelligencePathLayout'
export {
  createIntelligenceHomeContent,
  createUserMemoryIndexContent,
  getIntelligenceDir,
  getIntelligenceReferenceDirRelative,
  getUserMemoryIndexRelative,
} from './intelligencePathLayout'

export interface EnsureIntelligenceMemoryResult {
  success: boolean
  created: string[]
  error?: string
}

/**
 * Ensure 04_情报与连接 has user memory index + reference folder (create stubs only).
 */
export function ensureIntelligenceMemoryLayout(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh',
): EnsureIntelligenceMemoryResult {
  if (!workspacePath?.trim()) {
    return { success: false, created: [], error: 'No workspace path' }
  }

  const created: string[] = []

  try {
    const layout = language === 'en'
      ? { dir: '04_Intelligence', home: 'Intelligence_Home.md' }
      : { dir: '04_情报与连接', home: 'Intelligence_Home.md' }
    const intelDir = path.join(workspacePath, layout.dir)
    const refDir = path.join(workspacePath, getIntelligenceReferenceDirRelative(language))
    fs.mkdirSync(refDir, { recursive: true })

    const indexRel = getUserMemoryIndexRelative(language)
    const indexPath = path.join(workspacePath, indexRel)
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, createUserMemoryIndexContent(language), 'utf-8')
      created.push(indexRel)
    }

    const homeRel = `${layout.dir}/${layout.home}`
    const homePath = path.join(workspacePath, homeRel)
    if (!fs.existsSync(homePath)) {
      fs.mkdirSync(intelDir, { recursive: true })
      fs.writeFileSync(homePath, createIntelligenceHomeContent(language), 'utf-8')
      created.push(homeRel)
    }

    return { success: true, created }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, created, error: message }
  }
}
