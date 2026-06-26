/**
 * User-facing memory lives in 04_情报与连接 — not in ~/.codebuddy or CLI-only caches.
 */

import * as fs from 'fs'
import * as path from 'path'

export type WorkspaceLanguage = 'zh' | 'en'

const LAYOUT = {
  zh: {
    dir: '04_情报与连接',
    memoryIndex: '记忆索引.md',
    referenceDir: '参考',
    home: 'Intelligence_Home.md',
  },
  en: {
    dir: '04_Intelligence',
    memoryIndex: 'Memory_Index.md',
    referenceDir: 'Reference',
    home: 'Intelligence_Home.md',
  },
} as const

export function getIntelligenceDir(language: WorkspaceLanguage = 'zh'): string {
  return LAYOUT[language].dir
}

/** Canonical user memory index — searchable in Obsidian. */
export function getUserMemoryIndexRelative(language: WorkspaceLanguage = 'zh'): string {
  const layout = LAYOUT[language]
  return `${layout.dir}/${layout.memoryIndex}`
}

export function getIntelligenceReferenceDirRelative(language: WorkspaceLanguage = 'zh'): string {
  const layout = LAYOUT[language]
  return `${layout.dir}/${layout.referenceDir}/`
}

export function createUserMemoryIndexContent(language: WorkspaceLanguage = 'zh'): string {
  if (language === 'en') {
    return `# Memory Index

> User-facing long-term memory (searchable in your vault).
> When CLI auto-memory updates, **mirror a summary here** (Act & Verify).
> Detailed reference notes belong under \`Reference/\`.

## Reference (partners & external resources)

`
  }

  return `# Metamates 记忆索引

> 用户可读、可检索的长期记忆（在 Obsidian 中直接打开）。
> CLI 如有记忆更新，**必须同步摘要到此文件**（Act & Verify）。
> 详细参考条目放在 \`参考/\` 子目录。

## Reference (合作方与外部资源)

`
}

function createIntelligenceHomeContent(language: WorkspaceLanguage = 'zh'): string {
  if (language === 'en') {
    return `# Intelligence & Connections

External intelligence, people, and reference material.

- **Memory index**: [[${LAYOUT.en.memoryIndex}]] — user-facing long-term memory
- **Reference notes**: \`${LAYOUT.en.referenceDir}/\`
`
  }

  return `# 情报与连接 Intelligence

外部情报、人脉连接与参考材料。

- **记忆索引**：[[${LAYOUT.zh.memoryIndex}]] — 用户可读的长期记忆
- **参考条目**：\`${LAYOUT.zh.referenceDir}/\`
`
}

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
    const layout = LAYOUT[language]
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
