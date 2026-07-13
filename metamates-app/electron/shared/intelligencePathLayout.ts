/** Pure path layout for intelligence / memory (no Node fs — safe in renderer bundle). */

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

  return `# MetaMates 记忆索引

> 用户可读、可检索的长期记忆（在 Obsidian 中直接打开）。
> CLI 如有记忆更新，**必须同步摘要到此文件**（Act & Verify）。
> 详细参考条目放在 \`参考/\` 子目录。

## Reference (合作方与外部资源)

`
}

export function createIntelligenceHomeContent(language: WorkspaceLanguage = 'zh'): string {
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
