import { describe, expect, it } from 'vitest'
import type { EmptyStateContext } from './editorEmptyState'
import { resolveContextFileForQuestion } from './emptyStateContextFile'

function baseContext(overrides: Partial<EmptyStateContext> = {}): EmptyStateContext {
  return {
    hasWorkspace: true,
    isReturningUser: true,
    hour: 14,
    agentHint: 'ready',
    todayPlanExists: false,
    todayNoteExists: false,
    inboxCount: 0,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [],
    ...overrides,
  }
}

describe('resolveContextFileForQuestion', () => {
  it('maps plan-open-tasks to today PLAN file', () => {
    const ref = resolveContextFileForQuestion('plan-open-tasks', baseContext({
      todayPlanPath: 'E:/vault/2026-07-08 PLAN.md',
      planHeadline: '今日 PLAN',
      planFirstOpenTask: '5分钟报告修改',
      planPreview: '5分钟报告修改 · 写复盘',
    }))
    expect(ref?.path).toBe('E:/vault/2026-07-08 PLAN.md')
    expect(ref?.summary).toBe('今日 PLAN')
    expect(ref?.openLabelKey).toBe('emptyState.contextFile.openPlan')
  })

  it('maps inbox-graduate to inbox sample note, not ideas report', () => {
    const ref = resolveContextFileForQuestion('inbox-graduate', baseContext({
      inboxSamplePath: 'E:/vault/inbox/碎片-A.md',
      inboxSampleLabel: '碎片-A',
      inboxSampleSummary: '一个待整理的想法',
      recentIdeasPath: 'E:/vault/insights/Ideas_Report_2026-07-07.md',
      recentIdeasLabel: 'Ideas_Report_2026-07-07',
    }))
    expect(ref?.path).toBe('E:/vault/inbox/碎片-A.md')
    expect(ref?.path).not.toContain('Ideas_Report')
  })

  it('maps ideas-brewing to ideas report only', () => {
    const ref = resolveContextFileForQuestion('ideas-brewing', baseContext({
      recentIdeasPath: 'E:/vault/insights/Ideas_Report_2026-07-07.md',
      recentIdeasLabel: 'Ideas_Report_2026-07-07',
      recentIdeasSummary: '插件化路线',
    }))
    expect(ref?.path).toContain('Ideas_Report')
    expect(ref?.openLabelKey).toBe('emptyState.contextFile.openIdeasReport')
  })

  it('returns undefined for unrelated questions', () => {
    expect(resolveContextFileForQuestion('welcome-back', baseContext({
      recentIdeasPath: 'E:/vault/insights/Ideas_Report_2026-07-07.md',
    }))).toBeUndefined()
  })
})
