import type { WelcomeAgentHint } from './welcomeContent'

export type EmptyStateActionKind =
  | 'slash'
  | 'open_file'
  | 'open_workspace'
  | 'focus_agent'
  | 'open_settings'
  | 'install_agent'

export interface EmptyStateSuggestion {
  id: string
  kind: EmptyStateActionKind
  titleKey: string
  descriptionKey: string
  priority: number
  primary?: boolean
  slash?: string
  path?: string
}

export interface EmptyStateContext {
  hasWorkspace: boolean
  isReturningUser: boolean
  hour: number
  agentHint: WelcomeAgentHint
  todayPlanExists: boolean
  todayNoteExists: boolean
  todayPlanPath?: string
  todayNotePath?: string
  inboxCount: number
  planUncheckedCount: number
  planCheckedCount: number
  planFirstOpenTask?: string
  planHeadline?: string
  scheduleTodayCount: number
  scheduleNextSummary?: string
  scheduleNextTime?: string
  recentIdeasLabel?: string
  recentIdeasPath?: string
  recentIdeasSummary?: string
  recentIdeasPreview?: string
  recentFocusLabel?: string
  recentFocusPath?: string
  recentFocusSummary?: string
  recentFocusPreview?: string
  inboxSamplePath?: string
  inboxSampleLabel?: string
  inboxSampleSummary?: string
  inboxSamplePreview?: string
  planPreview?: string
  todayNoteSummary?: string
  todayNotePreview?: string
  calendarIcsPath?: string
  schedulePreview?: string
  recentFiles: { path: string; name: string }[]
  engineDisplayName?: string
  engineNamingSkippedAt?: number
  engineNamingPromptCount?: number
}

export type EmptyStateGreetingKey =
  | 'noWorkspace'
  | 'newUser'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'welcomeBack'

export function getEmptyStateGreetingKey(ctx: EmptyStateContext): EmptyStateGreetingKey {
  if (!ctx.hasWorkspace) return 'noWorkspace'
  if (!ctx.isReturningUser) return 'newUser'
  if (ctx.hour >= 5 && ctx.hour < 12) return 'morning'
  if (ctx.hour >= 17 && ctx.hour < 23) return 'evening'
  if (ctx.hour >= 12 && ctx.hour < 17) return 'afternoon'
  return 'welcomeBack'
}

export function getEmptyStateSubtitleKey(
  ctx: EmptyStateContext,
  greeting: EmptyStateGreetingKey,
): string {
  if (!ctx.hasWorkspace) return 'emptyState.subtitle.noWorkspace'
  if (ctx.agentHint === 'no_agent') return 'emptyState.subtitle.noAgent'
  if (ctx.agentHint === 'auth_required') return 'emptyState.subtitle.authRequired'
  if (greeting === 'newUser') return 'emptyState.subtitle.newUser'
  if (ctx.planFirstOpenTask) return 'emptyState.subtitle.planOpenTasks'
  if (ctx.scheduleTodayCount > 0) return 'emptyState.subtitle.scheduleToday'
  if (ctx.recentIdeasLabel) return 'emptyState.subtitle.ideasBrewing'
  if (ctx.inboxCount > 0) return 'emptyState.subtitle.inboxPending'
  if (!ctx.todayPlanExists && greeting === 'morning') return 'emptyState.subtitle.noPlanYet'
  return 'emptyState.subtitle.default'
}

/**
 * Build ranked empty-editor suggestions (engine-first, then vault context).
 */
export function buildEmptyStateSuggestions(ctx: EmptyStateContext): EmptyStateSuggestion[] {
  if (!ctx.hasWorkspace) {
    return [
      {
        id: 'open-workspace',
        kind: 'open_workspace',
        titleKey: 'emptyState.actions.openWorkspace.title',
        descriptionKey: 'emptyState.actions.openWorkspace.description',
        priority: 100,
        primary: true,
      },
      {
        id: 'learn-engine',
        kind: 'focus_agent',
        titleKey: 'emptyState.actions.learnEngine.title',
        descriptionKey: 'emptyState.actions.learnEngine.description',
        priority: 50,
      },
    ]
  }

  const suggestions: EmptyStateSuggestion[] = []

  if (ctx.agentHint === 'no_agent') {
    suggestions.push({
      id: 'install-agent',
      kind: 'install_agent',
      titleKey: 'emptyState.actions.installAgent.title',
      descriptionKey: 'emptyState.actions.installAgent.description',
      priority: 100,
      primary: true,
    })
  } else if (ctx.agentHint === 'auth_required') {
    suggestions.push({
      id: 'auth-agent',
      kind: 'focus_agent',
      titleKey: 'emptyState.actions.authAgent.title',
      descriptionKey: 'emptyState.actions.authAgent.description',
      priority: 100,
      primary: true,
    })
  } else if (ctx.agentHint === 'ready' || ctx.agentHint === 'connecting' || ctx.agentHint === 'idle') {
    const morningNoPlan = ctx.hour >= 5 && ctx.hour < 12 && !ctx.todayPlanExists
    const eveningWithNote = ctx.hour >= 17 && ctx.hour < 23 && ctx.todayNoteExists

    if (morningNoPlan) {
      suggestions.push({
        id: 'slash-today',
        kind: 'slash',
        titleKey: 'emptyState.actions.today.title',
        descriptionKey: 'emptyState.actions.today.description',
        priority: 95,
        primary: true,
        slash: 'today',
      })
    } else if (eveningWithNote) {
      suggestions.push({
        id: 'slash-closeday',
        kind: 'slash',
        titleKey: 'emptyState.actions.closeday.title',
        descriptionKey: 'emptyState.actions.closeday.description',
        priority: 95,
        primary: true,
        slash: 'closeday',
      })
    } else {
      suggestions.push({
        id: 'focus-agent',
        kind: 'focus_agent',
        titleKey: 'emptyState.actions.chat.title',
        descriptionKey: 'emptyState.actions.chat.description',
        priority: 90,
        primary: true,
      })
    }
  }

  if (ctx.inboxCount > 0 && ctx.agentHint !== 'no_agent') {
    suggestions.push({
      id: 'slash-graduate',
      kind: 'slash',
      titleKey: 'emptyState.actions.graduate.title',
      descriptionKey: 'emptyState.actions.graduate.description',
      priority: 80,
      slash: 'graduate',
    })
  }

  if (!ctx.todayPlanExists && ctx.hour >= 12 && ctx.hour < 22) {
    const hasToday = suggestions.some((s) => s.id === 'slash-today')
    if (!hasToday) {
      suggestions.push({
        id: 'slash-today-alt',
        kind: 'slash',
        titleKey: 'emptyState.actions.today.title',
        descriptionKey: 'emptyState.actions.today.description',
        priority: 70,
        slash: 'today',
      })
    }
  }

  if (ctx.todayPlanExists && ctx.todayPlanPath) {
    suggestions.push({
      id: 'open-today-plan',
      kind: 'open_file',
      titleKey: 'emptyState.actions.openTodayPlan.title',
      descriptionKey: 'emptyState.actions.openTodayPlan.description',
      priority: 65,
      path: ctx.todayPlanPath,
    })
  }

  for (const [index, file] of ctx.recentFiles.slice(0, 3).entries()) {
    suggestions.push({
      id: `recent-${index}`,
      kind: 'open_file',
      titleKey: 'emptyState.actions.recent.title',
      descriptionKey: 'emptyState.actions.recent.description',
      priority: 40 - index,
      path: file.path,
    })
  }

  if (ctx.agentHint === 'ready' && !suggestions.some((s) => s.kind === 'slash' && s.slash === 'intel')) {
    suggestions.push({
      id: 'slash-intel',
      kind: 'slash',
      titleKey: 'emptyState.actions.intel.title',
      descriptionKey: 'emptyState.actions.intel.description',
      priority: 30,
      slash: 'intel',
    })
  }

  const seen = new Set<string>()
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .filter((s) => {
      const key = s.kind === 'open_file' ? `file:${s.path}` : `${s.kind}:${s.slash ?? s.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
}

export function formatRecentFileLabel(name: string): string {
  return name.replace(/\.md$/i, '')
}
