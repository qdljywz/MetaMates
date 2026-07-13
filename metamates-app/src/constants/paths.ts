/**
 * MetaMates 工作区路径规范（与 inits/zh、inits/en 对齐）
 * 标准目录见 inits/README.md；LEGACY 路径用于兼容旧工作区。
 */

import {
  assertWithinWorkspace,
  isPathInsideWorkspace,
  pathAssertError,
  pathAssertResolved,
} from '../../electron/shared/pathSafetyCore'

export { isPathInsideWorkspace, toWorkspaceRelativePath } from '../../electron/shared/pathSafetyCore'
export {
  getUserMemoryIndexRelative,
  getIntelligenceReferenceDirRelative,
} from '../../electron/shared/intelligencePathLayout'

export type WorkspaceLanguage = 'zh' | 'en'

/**
 * Bundled seed templates under metamates-app/inits/{zh,en}.
 * Must never be opened as the user's live workspace — edits would corrupt the ship template.
 */
export function isShippedTemplateWorkspace(workspacePath: string | undefined | null): boolean {
  if (!workspacePath?.trim()) return false
  const norm = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return /\/inits\/(zh|en)$/.test(norm) || /\/metamates-app\/inits\/(zh|en)$/.test(norm)
}

/** 标准工作区目录（与 inits 模板一致） */
export const WORKSPACE_LAYOUT = {
  zh: {
    LOG_AND_PLAN: '01_日记与计划',
    PROJECTS: '02_项目与知识',
    INSIGHTS: '03_点滴积累',
    INTELLIGENCE: '04_情报与连接',
    TEMPLATES: '05_模板与配置',
    INBOX: 'Inbox',
  },
  en: {
    LOG_AND_PLAN: '01_Log_and_Plan',
    PROJECTS: '02_Project_and_Knowledge',
    INSIGHTS: '03_Insights',
    INTELLIGENCE: '04_Intelligence',
    TEMPLATES: '05_Templates_and_Config',
    INBOX: 'Inbox',
  },
} as const

/** 旧版路径（v0.4 及更早工作区） */
export const LEGACY_PATHS = {
  DAILY_PLAN_DIR: 'Daily Note&Plan',
  MASTER_CONTROL_ROOT: 'MasterControl.md',
} as const

/** 日记/计划目录名（中/英标准 + 旧版），用于侧栏日历匹配 */
export const DAILY_PLAN_DIR_MARKERS = [
  WORKSPACE_LAYOUT.zh.LOG_AND_PLAN,
  WORKSPACE_LAYOUT.en.LOG_AND_PLAN,
  LEGACY_PATHS.DAILY_PLAN_DIR,
] as const

export function isDailyPlanDirectoryPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return DAILY_PLAN_DIR_MARKERS.some((dir) => normalized.includes(`/${dir}/`))
}

export function parseDailyEntryFileName(
  name: string,
): { dateStr: string; kind: 'note' | 'plan' } | null {
  const noteMatch = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
  if (noteMatch) return { dateStr: noteMatch[1], kind: 'note' }
  const planMatch = name.match(/^(\d{4}-\d{2}-\d{2}) PLAN\.md$/)
  if (planMatch) return { dateStr: planMatch[1], kind: 'plan' }
  return null
}

/** 工作区内关键文件名 */
export const WORKSPACE_FILES = {
  MASTER_CONTROL: 'Master_Control.md',
  SECOND_MIND: '2M.md',
  DAILY_PLAN_TEMPLATE: 'Daily_Plan.md',
  DAILY_NOTE_TEMPLATE: 'Daily_Note.md',
} as const

/** 工作区根目录 Agent 人格 / CLI 指令配置（非用户笔记，不进图谱） */
export const AGENT_ROOT_CONFIG_FILES = [
  'GEMINI.md',
  'CLAUDE.md',
  'CODEBUDDY.md',
  'CODEX.md',
  'AI_Commands_Prompt.md',
] as const

/**
 * @deprecated 请使用 WORKSPACE_LAYOUT 与 getDailyPlanDir()
 */
export const PATHS = {
  DAILY_PLAN_DIR: WORKSPACE_LAYOUT.zh.LOG_AND_PLAN,
  DAILY_REVIEW_DIR: '每日复盘',
  PROJECTS_DIR: WORKSPACE_LAYOUT.zh.PROJECTS,
  TEMPLATES_DIR: WORKSPACE_LAYOUT.zh.TEMPLATES,
  DAILY_PLAN_FILE: (date: string) => `${date} PLAN.md`,
  DAILY_REVIEW_FILE: (date: string) => `${date} REVIEW.md`,
} as const

/**
 * 从 i18n 语言码解析工作区语言
 * @param locale - i18n.language 或 settings.language
 */
export function getWorkspaceLanguage(locale?: string): WorkspaceLanguage {
  return locale?.startsWith('en') ? 'en' : 'zh'
}

export const DEFAULT_USER_TIMEZONE = 'Asia/Shanghai'

function isValidTimezone(timezone: string | undefined | null): timezone is string {
  if (!timezone?.trim()) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** Prefer explicit settings timezone, else localStorage / browser / default. */
export function resolveUserTimezone(explicit?: string | null): string {
  if (isValidTimezone(explicit)) return explicit.trim()
  return getEffectiveTimezone()
}

/**
 * Resolve effective timezone for date-sensitive features.
 * Priority: explicit user setting -> browser/system timezone -> default Asia/Shanghai.
 */
export function getEffectiveTimezone(): string {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('metamates-storage')
      if (raw) {
        const parsed = JSON.parse(raw) as { settings?: { userTimezone?: string } }
        if (isValidTimezone(parsed.settings?.userTimezone)) {
          return parsed.settings!.userTimezone!
        }
      }
    } catch {
      // ignore parse errors and continue fallback chain
    }
  }

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (isValidTimezone(browserZone)) return browserZone
  return DEFAULT_USER_TIMEZONE
}

/**
 * 获取用户配置时区日期字符串 YYYY-MM-DD
 */
export function getTodayDateString(timezone: string = getEffectiveTimezone()): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: timezone })
}

/** Current hour (0–23) in given timezone. */
export function getCurrentHour(timezone: string = getEffectiveTimezone()): number {
  const hourStr = new Date().toLocaleString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })
  const hour = Number.parseInt(hourStr, 10)
  return Number.isFinite(hour) ? hour : new Date().getHours()
}

/** Current hour (0–23) in Asia/Shanghai (legacy helper). */
export function getBeijingHour(): number {
  return getCurrentHour(DEFAULT_USER_TIMEZONE)
}

/** Human-readable current time in effective timezone for agent prompts. */
export function formatNowInTimezone(timezone: string = getEffectiveTimezone()): string {
  return new Date().toLocaleString('sv-SE', {
    timeZone: timezone,
    hour12: false,
  })
}

export function getDailyPlanFileName(date: string): string {
  return `${date} PLAN.md`
}

export function getDailyNoteFileName(date: string): string {
  return `${date}.md`
}

export function getWorkspaceLayout(language: WorkspaceLanguage = 'zh') {
  return WORKSPACE_LAYOUT[language]
}

export function getDailyPlanDir(language: WorkspaceLanguage = 'zh'): string {
  return WORKSPACE_LAYOUT[language].LOG_AND_PLAN
}

export function getTemplatesDir(language: WorkspaceLanguage = 'zh'): string {
  return WORKSPACE_LAYOUT[language].TEMPLATES
}

export function getInboxDir(language: WorkspaceLanguage = 'zh'): string {
  const layout = WORKSPACE_LAYOUT[language]
  return `${layout.LOG_AND_PLAN}/${layout.INBOX}`
}

/** 确保 Inbox 目录存在并返回绝对路径 */
export async function resolveInboxDirPath(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh'
): Promise<string> {
  const relativeDir = getInboxDir(language)
  if (!window.electronAPI) {
    return `${workspacePath}/${relativeDir}`
  }
  const fullPath = await window.electronAPI.path.join(workspacePath, relativeDir)
  await window.electronAPI.createDirectory(fullPath)
  return fullPath
}

export function getDailyPlanPath(
  workspacePath: string,
  date: string,
  language: WorkspaceLanguage = 'zh'
): string {
  return `${workspacePath}/${getDailyPlanDir(language)}/${getDailyPlanFileName(date)}`
}

export function getDailyNotePath(
  workspacePath: string,
  date: string,
  language: WorkspaceLanguage = 'zh'
): string {
  return `${workspacePath}/${getDailyPlanDir(language)}/${getDailyNoteFileName(date)}`
}

export function getMasterControlPath(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh'
): string {
  return `${workspacePath}/${getTemplatesDir(language)}/${WORKSPACE_FILES.MASTER_CONTROL}`
}

export function getSecondMindPath(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh'
): string {
  return `${workspacePath}/${getTemplatesDir(language)}/${WORKSPACE_FILES.SECOND_MIND}`
}

export function getLegacyDailyPlanPath(workspacePath: string, date: string): string {
  return `${workspacePath}/${LEGACY_PATHS.DAILY_PLAN_DIR}/${getDailyPlanFileName(date)}`
}

export function getDailyReviewPath(workspacePath: string, date: string): string {
  return `${workspacePath}/${PATHS.DAILY_REVIEW_DIR}/${PATHS.DAILY_REVIEW_FILE(date)}`
}

/**
 * 解析日记/计划目录：优先标准路径，回退旧版 Daily Note&Plan
 */
export async function resolveDailyPlanDir(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh'
): Promise<string> {
  if (!window.electronAPI) return getDailyPlanDir(language)

  const standardDir = getDailyPlanDir(language)
  const standardPath = await window.electronAPI.path.join(workspacePath, standardDir)
  if ((await window.electronAPI.fileExists(standardPath)).exists) {
    return standardDir
  }

  const legacyPath = await window.electronAPI.path.join(
    workspacePath,
    LEGACY_PATHS.DAILY_PLAN_DIR
  )
  if ((await window.electronAPI.fileExists(legacyPath)).exists) {
    return LEGACY_PATHS.DAILY_PLAN_DIR
  }

  return standardDir
}

/**
 * 解析当日 PLAN 文件路径
 */
export async function resolveDailyPlanPath(
  workspacePath: string,
  date: string,
  language: WorkspaceLanguage = 'zh'
): Promise<string> {
  const dir = await resolveDailyPlanDir(workspacePath, language)
  return `${workspacePath}/${dir}/${getDailyPlanFileName(date)}`
}

/**
 * 解析当日日记文件路径
 */
export async function resolveDailyNotePath(
  workspacePath: string,
  date: string,
  language: WorkspaceLanguage = 'zh'
): Promise<string> {
  const dir = await resolveDailyPlanDir(workspacePath, language)
  return `${workspacePath}/${dir}/${getDailyNoteFileName(date)}`
}

/**
 * 解析 Master_Control.md 路径
 */
export async function resolveMasterControlPath(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh'
): Promise<string> {
  if (!window.electronAPI) return getMasterControlPath(workspacePath, language)

  const standardPath = getMasterControlPath(workspacePath, language)
  if ((await window.electronAPI.fileExists(standardPath)).exists) {
    return standardPath
  }

  const legacyRoot = `${workspacePath}/${LEGACY_PATHS.MASTER_CONTROL_ROOT}`
  if ((await window.electronAPI.fileExists(legacyRoot)).exists) {
    return legacyRoot
  }

  return standardPath
}

/** 默认每日计划内容 */
export function createDefaultDailyPlanContent(
  date: string,
  language: WorkspaceLanguage = 'zh'
): string {
  if (language === 'en') {
    return `# 📅 Daily Plan: ${date}

> Fill in today's guiding quote.

## 🔴 P0 Priorities
- [ ] Task A

## 🕒 Time Blocks
- [ ] **09:00 - 11:00**: Deep work
- [ ] **21:00 - 22:00**: Daily review
`
  }
  return `# 📅 每日计划：${date}

> 在此填入今日核心格言。

## 🔴 P0 绝对优先
- [ ] 任务 A

## 🕒 时间块划分
- [ ] **09:00 - 11:00**：深度工作
- [ ] **21:00 - 22:00**：每日复盘
`
}

/** 默认日记内容 */
export function createDefaultDailyNoteContent(
  date: string,
  language: WorkspaceLanguage = 'zh'
): string {
  if (language === 'en') {
    return `# 📅 Daily Note: ${date}

## Notes

`
  }
  return `# 📅 日记：${date}

## 随手记

`
}

export interface DailyEntryResult {
  path: string
  name: string
  created: boolean
}

/** 打开或创建指定日期的日记 / PLAN 文件 */
export async function openOrCreateDailyEntry(
  workspacePath: string,
  dateStr: string,
  kind: 'note' | 'plan',
  language: WorkspaceLanguage = 'zh'
): Promise<DailyEntryResult | null> {
  if (!window.electronAPI) return null

  const filePath = kind === 'plan'
    ? await resolveDailyPlanPath(workspacePath, dateStr, language)
    : await resolveDailyNotePath(workspacePath, dateStr, language)
  const fileName = kind === 'plan' ? getDailyPlanFileName(dateStr) : getDailyNoteFileName(dateStr)

  const existsResult = await window.electronAPI.fileExists(filePath)
  if (existsResult.exists) {
    return { path: filePath, name: fileName, created: false }
  }

  const planDir = await resolveDailyPlanDir(workspacePath, language)
  const planDirPath = await window.electronAPI.path.join(workspacePath, planDir)
  await window.electronAPI.createDirectory(planDirPath)

  const content = kind === 'plan'
    ? createDefaultDailyPlanContent(dateStr, language)
    : createDefaultDailyNoteContent(dateStr, language)
  const result = await window.electronAPI.writeFile(filePath, content)
  if (!result.success) return null

  return { path: filePath, name: fileName, created: true }
}

export interface WorkspaceFileCandidate {
  name: string
  path: string
}

/** 从多个同名文件中选出最可能的目标（日记目录优先） */
export function pickBestWorkspaceFileMatch(
  baseName: string,
  matches: WorkspaceFileCandidate[],
  language: WorkspaceLanguage = 'zh'
): string | null {
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0].path

  const normalizedName = baseName.toLowerCase()
  const dailyDir = getDailyPlanDir(language)
  const templatesDir = getTemplatesDir(language)

  if (/^\d{4}-\d{2}-\d{2}\.md$/i.test(baseName)) {
    const inDaily = matches.find((file) =>
      file.path.replace(/\\/g, '/').includes(`/${dailyDir}/`)
    )
    if (inDaily) return inDaily.path
  }

  if (/^\d{4}-\d{2}-\d{2} plan\.md$/i.test(baseName)) {
    const inDaily = matches.find((file) =>
      file.path.replace(/\\/g, '/').includes(`/${dailyDir}/`)
    )
    if (inDaily) return inDaily.path
  }

  if (normalizedName === 'daily_note.md' || normalizedName === 'daily_plan.md') {
    const inTemplates = matches.find((file) =>
      file.path.replace(/\\/g, '/').includes(`/${templatesDir}/`)
    )
    if (inTemplates) return inTemplates.path
  }

  return matches
    .slice()
    .sort((a, b) => a.path.replace(/\\/g, '/').length - b.path.replace(/\\/g, '/').length)[0]
    .path
}

/**
 * 将 Agent / 工具返回的路径解析为工作区内的真实文件路径。
 * 仅返回 Vault 内路径；工作区外路径一律拒绝（MetaMates 只管理 Vault）。
 */
export async function resolveWorkspaceFilePath(
  workspacePath: string,
  filePath: string,
  language: WorkspaceLanguage = 'zh',
  candidates: WorkspaceFileCandidate[] = []
): Promise<string | null> {
  if (!window.electronAPI || !workspacePath) return null

  let resolved = filePath.replace(/^["']|["']$/g, '').trim()
  if (!resolved) return null

  const isAbsolute = /^[A-Za-z]:[/\\]/.test(resolved) || resolved.startsWith('/')
  if (!isAbsolute) {
    resolved = await window.electronAPI.path.join(
      workspacePath,
      resolved.replace(/^\.?[\\/]+/, '')
    )
  }

  const guard = assertWithinWorkspace(workspacePath, resolved)
  if (pathAssertError(guard)) return null
  resolved = pathAssertResolved(guard)!

  if ((await window.electronAPI.fileExists(resolved)).exists) {
    return resolved
  }

  const baseName = resolved.split(/[/\\]/).pop()
  if (!baseName) return null

  const noteMatch = baseName.match(/^(\d{4}-\d{2}-\d{2})\.md$/i)
  if (noteMatch) {
    const dailyPath = await resolveDailyNotePath(workspacePath, noteMatch[1], language)
    if (isPathInsideWorkspace(workspacePath, dailyPath) && (await window.electronAPI.fileExists(dailyPath)).exists) {
      return dailyPath
    }
  }

  const planMatch = baseName.match(/^(\d{4}-\d{2}-\d{2}) PLAN\.md$/i)
  if (planMatch) {
    const planPath = await resolveDailyPlanPath(workspacePath, planMatch[1], language)
    if (isPathInsideWorkspace(workspacePath, planPath) && (await window.electronAPI.fileExists(planPath)).exists) {
      return planPath
    }
  }

  const templatePaths: Record<string, string> = {
    [WORKSPACE_FILES.DAILY_NOTE_TEMPLATE]: `${workspacePath}/${getTemplatesDir(language)}/${WORKSPACE_FILES.DAILY_NOTE_TEMPLATE}`,
    [WORKSPACE_FILES.DAILY_PLAN_TEMPLATE]: `${workspacePath}/${getTemplatesDir(language)}/${WORKSPACE_FILES.DAILY_PLAN_TEMPLATE}`,
    [WORKSPACE_FILES.MASTER_CONTROL]: `${workspacePath}/${getTemplatesDir(language)}/${WORKSPACE_FILES.MASTER_CONTROL}`,
    [WORKSPACE_FILES.SECOND_MIND]: `${workspacePath}/${getTemplatesDir(language)}/${WORKSPACE_FILES.SECOND_MIND}`,
  }
  const templatePath = templatePaths[baseName]
  if (templatePath && (await window.electronAPI.fileExists(templatePath)).exists) {
    return templatePath
  }

  const indexMatches = candidates.filter(
    (file) => file.name.toLowerCase() === baseName.toLowerCase()
  )
  const picked = pickBestWorkspaceFileMatch(baseName, indexMatches, language)
  if (picked && isPathInsideWorkspace(workspacePath, picked) && (await window.electronAPI.fileExists(picked)).exists) {
    return picked
  }

  return null
}
