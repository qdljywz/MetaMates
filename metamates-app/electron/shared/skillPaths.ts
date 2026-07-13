/** Shared slash-command path helpers (used by renderer and main process). */

import {
  getIntelligenceReferenceDirRelative,
  getUserMemoryIndexRelative,
} from './intelligencePathLayout'

export type WorkspaceLanguage = 'zh' | 'en'

const WORKSPACE_LAYOUT = {
  zh: {
    LOG_AND_PLAN: '01_日记与计划',
    PROJECTS: '02_项目与知识',
    INSIGHTS: '03_点滴积累',
    TEMPLATES: '05_模板与配置',
    INBOX: 'Inbox',
  },
  en: {
    LOG_AND_PLAN: '01_Log_and_Plan',
    PROJECTS: '02_Project_and_Knowledge',
    INSIGHTS: '03_Insights',
    TEMPLATES: '05_Templates_and_Config',
    INBOX: 'Inbox',
  },
} as const

const WORKSPACE_FILES = {
  MASTER_CONTROL: 'Master_Control.md',
  SECOND_MIND: '2M.md',
} as const

const ZH_SKILL_PATH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/01_日记与计划_Daily_Log\//g, '01_日记与计划/'],
  [/02_项目与知识_Knowledge_Base\//g, '02_项目与知识/'],
  [/03_点滴积累_Insights\//g, '03_点滴积累/'],
  [/05_模板与配置_Templates\//g, '05_模板与配置/'],
  [/04_情报与连接_Intelligence\//g, '04_情报与连接/'],
]

export function normalizeSkillFilePaths(content: string, language: WorkspaceLanguage = 'zh'): string {
  if (language !== 'zh') return content
  let next = content
  for (const [pattern, replacement] of ZH_SKILL_PATH_REPLACEMENTS) {
    next = next.replace(pattern, replacement)
  }
  next = next.replace(/YYYY-MM-DD_PLAN\.md/g, 'YYYY-MM-DD.md')
  return next
}

export function buildWorkspacePathHints(
  language: WorkspaceLanguage = 'zh',
  workspacePath?: string
): string {
  const layout = WORKSPACE_LAYOUT[language]
  const memoryIndex = getUserMemoryIndexRelative(language)
  const referenceDir = getIntelligenceReferenceDirRelative(language)
  const rootLine = workspacePath ? `Workspace root: ${workspacePath}` : 'Workspace root: (current working directory)'

  if (language === 'en') {
    return `[MetaMates path map — use these exact relative paths]
${rootLine}
- Daily notes: ${layout.LOG_AND_PLAN}/YYYY-MM-DD.md
- Daily plans: ${layout.LOG_AND_PLAN}/YYYY-MM-DD PLAN.md
- Master control: ${layout.TEMPLATES}/${WORKSPACE_FILES.MASTER_CONTROL}
- Second mind (SOAL): ${layout.TEMPLATES}/${WORKSPACE_FILES.SECOND_MIND}
- Projects: ${layout.PROJECTS}/
- Insights: ${layout.INSIGHTS}/
- Inbox: ${layout.LOG_AND_PLAN}/${layout.INBOX}/
- **User memory index**: ${memoryIndex} (mirror CLI memory here)
- **Reference notes**: ${referenceDir}

[CLI layout — workspace .codebuddy/ only]
- Slash-command skills: .codebuddy/skills/{command}/SKILL.md (MetaMates reads these first)
- CLI internal cache: .codebuddy/memories/ (not user-facing — sync summary to ${memoryIndex})
- Do NOT write to ~/.codebuddy/projects/... via shell
- User notes, plans, and memory MUST use vault paths above (Act & Verify)`
  }

  return `[MetaMates 路径映射 — 请使用以下相对路径读写文件]
${rootLine}
- 日记：${layout.LOG_AND_PLAN}/YYYY-MM-DD.md
- 每日计划：${layout.LOG_AND_PLAN}/YYYY-MM-DD PLAN.md
- 主控：${layout.TEMPLATES}/${WORKSPACE_FILES.MASTER_CONTROL}
- 进化层 SOAL：${layout.TEMPLATES}/${WORKSPACE_FILES.SECOND_MIND}
- 项目：${layout.PROJECTS}/
- 点滴：${layout.INSIGHTS}/
- 收件箱：${layout.LOG_AND_PLAN}/${layout.INBOX}/
- **用户记忆索引**：${memoryIndex}（CLI 记忆须镜像到此）
- **参考条目**：${referenceDir}

[CLI 目录 — 只用工作区内的 .codebuddy/]
- 斜杠命令技能：.codebuddy/skills/{命令名}/SKILL.md（MetaMates 优先读这里）
- CLI 内部缓存：.codebuddy/memories/（用户不可见 — 摘要同步到 ${memoryIndex}）
- 禁止用 shell 写到 ~/.codebuddy/projects/...
- 用户笔记、计划与记忆必须写在上述 Vault 路径（Act & Verify）`
}
