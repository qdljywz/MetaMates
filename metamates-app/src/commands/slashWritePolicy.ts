import type { WorkspaceLanguage } from './workspacePathHints'

/** Whether slash command output must land on disk. */
export type SlashWriteMode = 'never' | 'optional' | 'required'

export interface SlashWritePolicy {
  write: SlashWriteMode
  /** Relative path template(s) under workspace root. */
  targets: string[]
  /** overwrite = replace file; append = add section; create = new note when applicable */
  fileMode: 'overwrite' | 'append' | 'create'
  verify: boolean
}

const LAYOUT = {
  zh: {
    log: '01_日记与计划',
    templates: '05_模板与配置',
    insights: '03_点滴积累',
    inbox: '01_日记与计划/Inbox',
    intelligence: '04_情报与连接',
  },
  en: {
    log: '01_Log_and_Plan',
    templates: '05_Templates_and_Config',
    insights: '03_Insights',
    inbox: '01_Log_and_Plan/Inbox',
    intelligence: '04_Intelligence',
  },
} as const

/**
 * Unified write-to-disk policy for all 15 slash commands.
 * Single source of truth for prompt injection and skill alignment.
 */
export const SLASH_WRITE_POLICIES: Record<string, SlashWritePolicy> = {
  '/context': { write: 'never', targets: [], fileMode: 'overwrite', verify: false },
  '/today': {
    write: 'required',
    targets: ['{log}/YYYY-MM-DD PLAN.md'],
    fileMode: 'overwrite',
    verify: true,
  },
  '/closeday': {
    write: 'required',
    targets: ['{log}/YYYY-MM-DD.md'],
    fileMode: 'append',
    verify: true,
  },
  '/schedule': {
    write: 'required',
    targets: ['{templates}/Master_Control.md'],
    fileMode: 'overwrite',
    verify: true,
  },
  '/trace': { write: 'never', targets: [], fileMode: 'overwrite', verify: false },
  '/connect': { write: 'never', targets: [], fileMode: 'overwrite', verify: false },
  '/challenge': { write: 'never', targets: [], fileMode: 'overwrite', verify: false },
  '/ghost': {
    write: 'optional',
    targets: ['{inbox}/ghost-draft-YYYY-MM-DD.md'],
    fileMode: 'create',
    verify: false,
  },
  '/ideas': {
    write: 'optional',
    targets: ['{insights}/'],
    fileMode: 'create',
    verify: false,
  },
  '/graduate': {
    write: 'required',
    targets: ['{insights}/', '{projects}/'],
    fileMode: 'create',
    verify: true,
  },
  '/drift': { write: 'never', targets: [], fileMode: 'overwrite', verify: false },
  '/emerge': { write: 'never', targets: [], fileMode: 'overwrite', verify: false },
  '/sync': {
    write: 'required',
    targets: ['{templates}/Master_Control.md'],
    fileMode: 'overwrite',
    verify: true,
  },
  '/soal': {
    write: 'required',
    targets: ['{templates}/2M.md'],
    fileMode: 'append',
    verify: true,
  },
  '/intel': {
    write: 'required',
    targets: ['{intelligence}/'],
    fileMode: 'create',
    verify: true,
  },
}

function resolveTargets(policy: SlashWritePolicy, lang: WorkspaceLanguage): string[] {
  const layout = LAYOUT[lang]
  const projects = lang === 'zh' ? '02_项目与知识' : '02_Project_and_Knowledge'
  return policy.targets.map((t) =>
    t
      .replace('{log}', layout.log)
      .replace('{templates}', layout.templates)
      .replace('{insights}', layout.insights)
      .replace('{inbox}', layout.inbox)
      .replace('{intelligence}', layout.intelligence)
      .replace('{projects}', projects),
  )
}

/**
 * Inject mandatory writeback instructions into every slash prompt.
 */
export function buildWritePolicyBlock(cmdId: string, lang: WorkspaceLanguage = 'zh'): string {
  const policy = SLASH_WRITE_POLICIES[cmdId]
  if (!policy || policy.write === 'never') {
    if (lang === 'en') {
      return `[Write policy]
This command is analysis-only. Reply in chat; do not create or modify vault files unless the user explicitly asks.
If you update long-term user memory, mirror a summary to 04_Intelligence/Memory_Index.md (details under Reference/) — never only ~/.codebuddy or CLI caches.`
    }
    return `[写回策略]
本命令以对话分析为主，请勿创建或修改仓库文件，除非用户明确要求。
若更新用户长期记忆，须同步摘要到 04_情报与连接/记忆索引.md（详细条目放 参考/），禁止只写 ~/.codebuddy 或 CLI 内部缓存。`
  }

  const targets = resolveTargets(policy, lang)
  const targetList = targets.map((t) => `- ${t}`).join('\n')
  const modeLabel =
    policy.fileMode === 'overwrite'
      ? lang === 'en' ? 'full overwrite' : '全量覆写'
      : policy.fileMode === 'append'
        ? lang === 'en' ? 'append / merge sections' : '追加或合并区块'
        : lang === 'en' ? 'create new note(s)' : '创建新笔记'

  const requirement =
    policy.write === 'required'
      ? lang === 'en' ? 'MANDATORY' : '必须'
      : lang === 'en' ? 'OPTIONAL when actionable' : '有实质产出时再写'

  const verifyLine = policy.verify
    ? lang === 'en'
      ? 'After writing, read the file back and confirm the update succeeded.'
      : '写回后必须重新读取文件并确认更新成功。'
    : ''

  if (lang === 'en') {
    return `[Write policy — ${requirement}]
Pipeline: read vault → process → write back (Act & Verify).
Write mode: ${modeLabel}
Target path(s):
${targetList}
Use the Write/edit tool to persist results; chat-only output is insufficient for this command.
Never write to ~/.codebuddy/projects/... or other paths outside the vault.
User-facing memory must land in 04_情报与连接/Memory_Index.md (reference notes under 04_情报与连接/Reference/).
${verifyLine}`.trim()
  }

  return `[写回策略 — ${requirement}]
流程：读取仓库 → 加工 → 写回（Act & Verify）。
写入方式：${modeLabel}
目标路径：
${targetList}
必须使用 Write/编辑 工具落盘；仅聊天输出不算完成。
用户可读的记忆必须写入 04_情报与连接/记忆索引.md，详细参考放在 04_情报与连接/参考/；禁止只写到 ~/.codebuddy 或 CLI 缓存。
${verifyLine}`.trim()
}

/** Whether gemini/codebuddy skill frontmatter should allow Write for this command. */
export function slashCommandNeedsWriteTool(cmdId: string): boolean {
  const policy = SLASH_WRITE_POLICIES[cmdId]
  return !!policy && policy.write !== 'never'
}
