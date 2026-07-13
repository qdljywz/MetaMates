import type { EmptyStateContext } from './editorEmptyState'
import { formatRecentFileLabel } from './editorEmptyState'

/** File reference shown under an empty-state question when it points at a vault note. */
export interface EmptyStateContextFileRef {
  path: string
  label: string
  summary?: string
  preview?: string
  openLabelKey: string
}

function basenameLabel(filePath: string): string {
  return formatRecentFileLabel(filePath.split(/[/\\]/).pop() || filePath)
}

/**
 * Resolve which vault file (if any) the current empty-state question is about.
 * Each question type maps to its own file — never a global "latest ideas report".
 */
export function resolveContextFileForQuestion(
  questionId: string,
  ctx: EmptyStateContext,
): EmptyStateContextFileRef | undefined {
  switch (questionId) {
    case 'plan-open-tasks':
    case 'review-plan':
      if (!ctx.todayPlanPath) return undefined
      return {
        path: ctx.todayPlanPath,
        label: basenameLabel(ctx.todayPlanPath),
        summary: ctx.planHeadline ?? ctx.planFirstOpenTask,
        preview: ctx.planPreview,
        openLabelKey: 'emptyState.contextFile.openPlan',
      }

    case 'inbox-graduate':
      if (!ctx.inboxSamplePath) return undefined
      return {
        path: ctx.inboxSamplePath,
        label: ctx.inboxSampleLabel ?? basenameLabel(ctx.inboxSamplePath),
        summary: ctx.inboxSampleSummary,
        preview: ctx.inboxSamplePreview,
        openLabelKey: 'emptyState.contextFile.openInboxNote',
      }

    case 'continue-recent':
      if (!ctx.recentFocusPath) return undefined
      return {
        path: ctx.recentFocusPath,
        label: ctx.recentFocusLabel ?? basenameLabel(ctx.recentFocusPath),
        summary: ctx.recentFocusSummary,
        preview: ctx.recentFocusPreview,
        openLabelKey: 'emptyState.contextFile.openNote',
      }

    case 'ideas-brewing':
      if (!ctx.recentIdeasPath) return undefined
      return {
        path: ctx.recentIdeasPath,
        label: ctx.recentIdeasLabel ?? basenameLabel(ctx.recentIdeasPath),
        summary: ctx.recentIdeasSummary,
        preview: ctx.recentIdeasPreview,
        openLabelKey: 'emptyState.contextFile.openIdeasReport',
      }

    case 'evening-closeday':
      if (!ctx.todayNotePath || !ctx.todayNoteExists) return undefined
      return {
        path: ctx.todayNotePath,
        label: basenameLabel(ctx.todayNotePath),
        summary: ctx.todayNoteSummary,
        preview: ctx.todayNotePreview,
        openLabelKey: 'emptyState.contextFile.openJournal',
      }

    case 'schedule-today':
      if (!ctx.calendarIcsPath) return undefined
      return {
        path: ctx.calendarIcsPath,
        label: basenameLabel(ctx.calendarIcsPath),
        summary: ctx.scheduleNextSummary
          ? `${ctx.scheduleNextTime ?? ''} ${ctx.scheduleNextSummary}`.trim()
          : undefined,
        preview: ctx.schedulePreview,
        openLabelKey: 'emptyState.contextFile.openCalendar',
      }

    default:
      return undefined
  }
}
