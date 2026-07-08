import { describe, it, expect } from 'vitest'
import {
  getDailyPlanPath,
  getDailyNotePath,
  getMasterControlPath,
  getTodayDateString,
  getWorkspaceLanguage,
  getDailyPlanFileName,
  createDefaultDailyPlanContent,
  pickBestWorkspaceFileMatch,
  WORKSPACE_LAYOUT,
  LEGACY_PATHS,
} from '../constants/paths'

describe('paths constants', () => {
  const workspace = '/vault'

  it('应使用标准中文目录结构', () => {
    expect(getDailyPlanPath(workspace, '2026-06-18', 'zh')).toBe(
      '/vault/01_日记与计划/2026-06-18 PLAN.md'
    )
    expect(getDailyNotePath(workspace, '2026-06-18', 'zh')).toBe(
      '/vault/01_日记与计划/2026-06-18.md'
    )
    expect(getMasterControlPath(workspace, 'zh')).toBe(
      '/vault/05_模板与配置/Master_Control.md'
    )
  })

  it('应使用标准英文目录结构', () => {
    expect(getDailyPlanPath(workspace, '2026-06-18', 'en')).toBe(
      '/vault/01_Log_and_Plan/2026-06-18 PLAN.md'
    )
    expect(getMasterControlPath(workspace, 'en')).toBe(
      '/vault/05_Templates_and_Config/Master_Control.md'
    )
  })

  it('getWorkspaceLanguage 应解析 i18n 语言码', () => {
    expect(getWorkspaceLanguage('zh-CN')).toBe('zh')
    expect(getWorkspaceLanguage('en-US')).toBe('en')
    expect(getWorkspaceLanguage(undefined)).toBe('zh')
  })

  it('getTodayDateString 应返回 YYYY-MM-DD 格式', () => {
    expect(getTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('getDailyPlanFileName 应包含 PLAN 后缀', () => {
    expect(getDailyPlanFileName('2026-06-18')).toBe('2026-06-18 PLAN.md')
  })

  it('createDefaultDailyPlanContent 应包含日期', () => {
    const content = createDefaultDailyPlanContent('2026-06-18', 'zh')
    expect(content).toContain('2026-06-18')
    expect(content).toContain('P0')
  })

  it('WORKSPACE_LAYOUT 应包含六个标准目录（含 Inbox）', () => {
    expect(Object.keys(WORKSPACE_LAYOUT.zh)).toHaveLength(6)
    expect(WORKSPACE_LAYOUT.zh.LOG_AND_PLAN).toBe('01_日记与计划')
    expect(WORKSPACE_LAYOUT.zh.INBOX).toBe('Inbox')
  })

  it('LEGACY_PATHS 应保留旧目录名', () => {
    expect(LEGACY_PATHS.DAILY_PLAN_DIR).toBe('Daily Note&Plan')
  })

  it('pickBestWorkspaceFileMatch 应优先日记目录中的同名文件', () => {
    const matches = [
      { name: '2026-06-19.md', path: '/vault/2026-06-19.md' },
      { name: '2026-06-19.md', path: '/vault/01_日记与计划/2026-06-19.md' },
    ]
    expect(pickBestWorkspaceFileMatch('2026-06-19.md', matches, 'zh')).toBe(
      '/vault/01_日记与计划/2026-06-19.md'
    )
  })

  it('pickBestWorkspaceFileMatch 应优先模板目录中的 Daily_Note.md', () => {
    const matches = [
      { name: 'Daily_Note.md', path: '/vault/Daily_Note.md' },
      { name: 'Daily_Note.md', path: '/vault/05_模板与配置/Daily_Note.md' },
    ]
    expect(pickBestWorkspaceFileMatch('Daily_Note.md', matches, 'zh')).toBe(
      '/vault/05_模板与配置/Daily_Note.md'
    )
  })
})
