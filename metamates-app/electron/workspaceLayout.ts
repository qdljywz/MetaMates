/**
 * 工作区目录布局（与 inits 模板及 src/constants/paths.ts 保持一致）
 */

import * as fs from 'fs'
import * as path from 'path'

export type WorkspaceLanguage = 'zh' | 'en'

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

export const LEGACY_PATHS = {
  DAILY_PLAN_DIR: 'Daily Note&Plan',
  MASTER_CONTROL_ROOT: 'MasterControl.md',
} as const

export const WORKSPACE_FILES = {
  MASTER_CONTROL: 'Master_Control.md',
} as const

export function getLayout(language: WorkspaceLanguage = 'zh') {
  return WORKSPACE_LAYOUT[language]
}

/** Resolve inbox directory under workspace (creates if missing). */
export function resolveInboxDir(workspacePath: string, language: WorkspaceLanguage = 'zh'): string {
  const layout = getLayout(language)
  return `${layout.LOG_AND_PLAN}/${layout.INBOX}`
}

export function detectWorkspaceLanguage(workspacePath: string): WorkspaceLanguage {
  const zhMarker = path.join(workspacePath, WORKSPACE_LAYOUT.zh.LOG_AND_PLAN)
  const enMarker = path.join(workspacePath, WORKSPACE_LAYOUT.en.LOG_AND_PLAN)
  if (fs.existsSync(zhMarker)) return 'zh'
  if (fs.existsSync(enMarker)) return 'en'
  return 'zh'
}
