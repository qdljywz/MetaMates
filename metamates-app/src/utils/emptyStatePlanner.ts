import { getTodayDateString } from '../constants/paths'
import type { EmptyStateContext, EmptyStateSuggestion } from './editorEmptyState'
import { buildEmptyStateSuggestions, formatRecentFileLabel } from './editorEmptyState'
import { inboxQuestionPriority, isNoiseRecentFile } from './emptyStateContextSignals'

export const EMPTY_STATE_REFRESH_MS = 10 * 60 * 1000
export const EMPTY_STATE_HISTORY_MAX = 24

export interface EmptyStateHistoryItem {
  questionId: string
  shownAt: number
  actedAt?: number
}

export interface EmptyStateCacheEntry {
  workspacePath: string
  generatedAt: number
  contextFingerprint: string
  significantFingerprint?: string
  questionId: string
  questionKey: string
  questionText?: string
  questionParams: Record<string, string | number>
  questionVariant?: number
  prefillKey: string
  prefillParams: Record<string, string | number>
  contextLineKey?: string
  contextLineText?: string
  contextLineParams?: Record<string, string | number>
  history: EmptyStateHistoryItem[]
}

export interface EmptyStateSnapshot {
  questionId: string
  questionKey: string
  questionText?: string
  questionParams: Record<string, string | number>
  questionVariant: number
  prefillKey: string
  prefillParams: Record<string, string | number>
  contextLineKey?: string
  contextLineText?: string
  contextLineParams?: Record<string, string | number>
  suggestions: EmptyStateSuggestion[]
  primaryAction?: EmptyStateSuggestion
  generatedAt: number
  contextFingerprint: string
  significantFingerprint: string
  fromCache: boolean
}

interface QuestionCandidate {
  id: string
  questionKey: string
  questionParams?: Record<string, string | number>
  prefillKey: string
  prefillParams?: Record<string, string | number>
  contextLineKey?: string
  contextLineParams?: Record<string, string | number>
  priority: number
}

const CACHE_STORAGE_KEY = 'metamates-empty-state-v1'

export type EmptyStateRefreshMode = 'none' | 'local_rephrase' | 'full_rethink'

const QUESTION_VARIANTS: Record<string, string[]> = {
  'no-workspace': ['emptyState.questions.noWorkspace'],
  'no-agent': ['emptyState.questions.noAgent'],
  'auth-required': ['emptyState.questions.authRequired'],
  'new-user': ['emptyState.questions.newUser'],
  'morning-no-plan': [
    'emptyState.questions.morningNoPlan',
    'emptyState.questions.morningNoPlanGentle',
  ],
  'inbox-graduate': [
    'emptyState.questions.inboxGraduate',
    'emptyState.questions.inboxGraduateTheme',
    'emptyState.questions.inboxGraduateGentle',
  ],
  'continue-recent': [
    'emptyState.questions.continueRecent',
    'emptyState.questions.continueRecentDecision',
  ],
  'evening-closeday': [
    'emptyState.questions.eveningCloseDay',
    'emptyState.questions.eveningCloseDayGentle',
  ],
  'evening-no-note': [
    'emptyState.questions.eveningNoNote',
    'emptyState.questions.eveningNoNoteGentle',
  ],
  'review-plan': [
    'emptyState.questions.reviewPlan',
    'emptyState.questions.reviewPlanTension',
  ],
  'afternoon-no-plan': [
    'emptyState.questions.afternoonNoPlan',
    'emptyState.questions.afternoonNoPlanFocus',
  ],
  'plan-open-tasks': [
    'emptyState.questions.planOpenTasks',
    'emptyState.questions.planOpenTasksTension',
    'emptyState.questions.planOpenTasksGentle',
  ],
  'schedule-today': [
    'emptyState.questions.scheduleToday',
    'emptyState.questions.scheduleTodayTension',
  ],
  'ideas-brewing': [
    'emptyState.questions.ideasBrewing',
    'emptyState.questions.ideasBrewingFocus',
  ],
  'welcome-back': [
    'emptyState.questions.welcomeBack',
    'emptyState.questions.welcomeBackFocus',
  ],
}

function normalizeWorkspaceKey(workspacePath: string): string {
  return workspacePath.replace(/\\/g, '/').toLowerCase()
}

export function buildContextFingerprint(ctx: EmptyStateContext, beijingDate = getTodayDateString()): string {
  const recentSig = ctx.recentFiles
    .slice(0, 3)
    .map((f) => f.path)
    .join('|')
  return [
    beijingDate,
    String(ctx.hour),
    ctx.agentHint,
    ctx.todayPlanExists ? '1' : '0',
    ctx.todayNoteExists ? '1' : '0',
    String(ctx.inboxCount),
    String(ctx.planUncheckedCount),
    String(ctx.scheduleTodayCount),
    ctx.recentFocusLabel ?? '',
    ctx.recentIdeasLabel ?? '',
    recentSig,
  ].join('::')
}

/**
 * Build a coarse fingerprint for "did the user's real situation materially change?"
 * Minor count fluctuations or the same recent note should not force a full rethink.
 */
export function buildSignificantContextFingerprint(
  ctx: EmptyStateContext,
  beijingDate = getTodayDateString(),
): string {
  const recentPrimary = ctx.recentFocusLabel
    ?? (ctx.recentFiles[0] && !isNoiseRecentFile(ctx.recentFiles[0].name) ? ctx.recentFiles[0].path : '')
  const inboxBand =
    ctx.inboxCount === 0 ? 'empty' : ctx.inboxCount <= 3 ? 'small' : ctx.inboxCount <= 12 ? 'medium' : 'large'
  const planBand =
    !ctx.todayPlanExists ? 'no-plan'
      : ctx.planUncheckedCount === 0 ? 'plan-done'
        : ctx.planUncheckedCount <= 3 ? 'plan-few-open'
          : 'plan-many-open'
  const scheduleBand = ctx.scheduleTodayCount > 0 ? 'has-events' : 'no-events'
  const dayPhase =
    ctx.hour >= 5 && ctx.hour < 12 ? 'morning'
      : ctx.hour >= 12 && ctx.hour < 17 ? 'afternoon'
        : ctx.hour >= 17 && ctx.hour < 23 ? 'evening'
          : 'night'
  return [
    beijingDate,
    dayPhase,
    ctx.agentHint,
    ctx.todayPlanExists ? 'plan' : 'no-plan',
    ctx.todayNoteExists ? 'note' : 'no-note',
    inboxBand,
    planBand,
    scheduleBand,
    recentPrimary,
  ].join('::')
}

export function shouldRefreshEmptyStateCache(
  cached: EmptyStateCacheEntry | null,
  fingerprint: string,
  now = Date.now(),
): boolean {
  if (!cached) return true
  if (cached.contextFingerprint !== fingerprint) return true
  if (now - cached.generatedAt > EMPTY_STATE_REFRESH_MS) return true
  return false
}

/**
 * Decide whether to fully rethink the problem, locally rephrase it, or keep it unchanged.
 * Full rethink is reserved for meaningful situation changes; local rephrase is the cheap path.
 */
export function decideEmptyStateRefreshMode(
  cached: EmptyStateCacheEntry | null,
  ctx: EmptyStateContext,
  options?: { beijingDate?: string; now?: number },
): EmptyStateRefreshMode {
  const now = options?.now ?? Date.now()
  if (!cached) return 'full_rethink'

  const fingerprint = buildContextFingerprint(ctx, options?.beijingDate)
  const significant = buildSignificantContextFingerprint(ctx, options?.beijingDate)
  const cachedSignificant = cached.significantFingerprint ?? cached.contextFingerprint

  if (cachedSignificant !== significant) return 'full_rethink'
  if (cached.contextFingerprint !== fingerprint) return 'local_rephrase'
  if (now - cached.generatedAt > EMPTY_STATE_REFRESH_MS) return 'local_rephrase'
  return 'none'
}

function wasQuestionShownRecently(
  history: EmptyStateHistoryItem[],
  questionId: string,
  withinMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
): boolean {
  return history.some(
    (item) => item.questionId === questionId && now - item.shownAt < withinMs,
  )
}

function countRecentShows(history: EmptyStateHistoryItem[], questionId: string, limit = 8): number {
  return history.slice(0, limit).filter((item) => item.questionId === questionId).length
}

function pickQuestion(
  candidates: QuestionCandidate[],
  history: EmptyStateHistoryItem[],
): QuestionCandidate {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority)
  const fresh = sorted.find(
    (c) => !wasQuestionShownRecently(history, c.id) && countRecentShows(history, c.id) < 2,
  )
  if (fresh) return fresh
  const lessFatigued = sorted.find((c) => countRecentShows(history, c.id) < 2)
  return lessFatigued ?? sorted[0]!
}

export function buildQuestionCandidates(ctx: EmptyStateContext): QuestionCandidate[] {
  const recentName = ctx.recentFocusLabel
    ?? (ctx.recentFiles[0] ? formatRecentFileLabel(ctx.recentFiles[0].name) : '')

  if (!ctx.hasWorkspace) {
    return [
      {
        id: 'no-workspace',
        questionKey: 'emptyState.questions.noWorkspace',
        prefillKey: 'emptyState.prefill.noWorkspace',
        priority: 100,
      },
    ]
  }

  if (ctx.agentHint === 'no_agent') {
    return [
      {
        id: 'no-agent',
        questionKey: 'emptyState.questions.noAgent',
        prefillKey: 'emptyState.prefill.noAgent',
        priority: 100,
      },
    ]
  }

  if (ctx.agentHint === 'auth_required') {
    return [
      {
        id: 'auth-required',
        questionKey: 'emptyState.questions.authRequired',
        prefillKey: 'emptyState.prefill.authRequired',
        priority: 100,
      },
    ]
  }

  const candidates: QuestionCandidate[] = []

  if (!ctx.isReturningUser) {
    candidates.push({
      id: 'new-user',
      questionKey: 'emptyState.questions.newUser',
      prefillKey: 'emptyState.prefill.newUser',
      priority: 95,
    })
  }

  if (ctx.hour >= 5 && ctx.hour < 12 && !ctx.todayPlanExists) {
    candidates.push({
      id: 'morning-no-plan',
      questionKey: 'emptyState.questions.morningNoPlan',
      prefillKey: 'emptyState.prefill.morningNoPlan',
      priority: 92,
    })
  }

  if (ctx.todayPlanExists && ctx.planUncheckedCount > 0 && ctx.planFirstOpenTask) {
    candidates.push({
      id: 'plan-open-tasks',
      questionKey: 'emptyState.questions.planOpenTasks',
      questionParams: { task: ctx.planFirstOpenTask, count: ctx.planUncheckedCount },
      prefillKey: 'emptyState.prefill.planOpenTasks',
      prefillParams: { task: ctx.planFirstOpenTask },
      contextLineKey: 'emptyState.contextLine.planOpen',
      contextLineParams: { task: ctx.planFirstOpenTask, count: ctx.planUncheckedCount },
      priority: 91,
    })
  }

  if (ctx.scheduleTodayCount > 0 && ctx.hour >= 8 && ctx.hour < 21) {
    candidates.push({
      id: 'schedule-today',
      questionKey: 'emptyState.questions.scheduleToday',
      questionParams: {
        count: ctx.scheduleTodayCount,
        event: ctx.scheduleNextSummary ?? '',
        time: ctx.scheduleNextTime ?? '',
      },
      prefillKey: 'emptyState.prefill.scheduleToday',
      prefillParams: { event: ctx.scheduleNextSummary ?? '' },
      contextLineKey: 'emptyState.contextLine.schedule',
      contextLineParams: {
        count: ctx.scheduleTodayCount,
        event: ctx.scheduleNextSummary ?? '',
        time: ctx.scheduleNextTime ?? '',
      },
      priority: 90,
    })
  }

  if (ctx.inboxCount > 0) {
    const inboxPriority = inboxQuestionPriority(ctx.inboxCount)
    candidates.push({
      id: 'inbox-graduate',
      questionKey: 'emptyState.questions.inboxGraduate',
      questionParams: { count: ctx.inboxCount },
      prefillKey: 'emptyState.prefill.inboxGraduate',
      prefillParams: { count: ctx.inboxCount },
      contextLineKey: 'emptyState.contextLine.inbox',
      contextLineParams: { count: ctx.inboxCount },
      priority: inboxPriority,
    })
  }

  if (recentName && ctx.hour >= 12 && ctx.hour < 22) {
    candidates.push({
      id: 'continue-recent',
      questionKey: 'emptyState.questions.continueRecent',
      questionParams: { name: recentName },
      prefillKey: 'emptyState.prefill.continueRecent',
      prefillParams: { name: recentName },
      priority: 86,
    })
  }

  if (ctx.recentIdeasLabel) {
    candidates.push({
      id: 'ideas-brewing',
      questionKey: 'emptyState.questions.ideasBrewing',
      questionParams: { report: ctx.recentIdeasLabel },
      prefillKey: 'emptyState.prefill.ideasBrewing',
      prefillParams: { report: ctx.recentIdeasLabel },
      contextLineKey: 'emptyState.contextLine.ideas',
      contextLineParams: { report: ctx.recentIdeasLabel },
      priority: 85,
    })
  }

  if (ctx.hour >= 17 && ctx.hour < 23 && ctx.todayNoteExists) {
    candidates.push({
      id: 'evening-closeday',
      questionKey: 'emptyState.questions.eveningCloseDay',
      prefillKey: 'emptyState.prefill.eveningCloseDay',
      priority: 84,
    })
  }

  if (ctx.hour >= 17 && ctx.hour < 23 && !ctx.todayNoteExists) {
    candidates.push({
      id: 'evening-no-note',
      questionKey: 'emptyState.questions.eveningNoNote',
      prefillKey: 'emptyState.prefill.eveningNoNote',
      priority: 82,
    })
  }

  if (ctx.todayPlanExists && ctx.hour >= 12 && ctx.hour < 22) {
    candidates.push({
      id: 'review-plan',
      questionKey: 'emptyState.questions.reviewPlan',
      prefillKey: 'emptyState.prefill.reviewPlan',
      priority: 80,
    })
  }

  if (!ctx.todayPlanExists && ctx.hour >= 12 && ctx.hour < 22) {
    candidates.push({
      id: 'afternoon-no-plan',
      questionKey: 'emptyState.questions.afternoonNoPlan',
      prefillKey: 'emptyState.prefill.afternoonNoPlan',
      priority: 78,
    })
  }

  candidates.push({
    id: 'welcome-back',
    questionKey: 'emptyState.questions.welcomeBack',
    prefillKey: 'emptyState.prefill.welcomeBack',
    priority: 50,
  })

  return candidates
}

export function buildEmptyStateSnapshot(
  ctx: EmptyStateContext,
  history: EmptyStateHistoryItem[] = [],
  options?: { beijingDate?: string; now?: number; questionVariant?: number },
): EmptyStateSnapshot {
  const beijingDate = options?.beijingDate ?? getTodayDateString()
  const now = options?.now ?? Date.now()
  const fingerprint = buildContextFingerprint(ctx, beijingDate)
  const significantFingerprint = buildSignificantContextFingerprint(ctx, beijingDate)
  const candidates = buildQuestionCandidates(ctx)
  const picked = pickQuestion(candidates, history)
  const suggestions = buildEmptyStateSuggestions(ctx)
  const primaryAction = suggestions.find((s) => s.primary) ?? suggestions[0]
  const variants = QUESTION_VARIANTS[picked.id] ?? [picked.questionKey]
  const questionVariant = variants.length > 0
    ? Math.abs(options?.questionVariant ?? 0) % variants.length
    : 0
  const questionKey = variants[questionVariant] ?? picked.questionKey

  return {
    questionId: picked.id,
    questionKey,
    questionParams: picked.questionParams ?? {},
    questionVariant,
    prefillKey: picked.prefillKey,
    prefillParams: picked.prefillParams ?? {},
    contextLineKey: picked.contextLineKey,
    contextLineParams: picked.contextLineParams,
    suggestions,
    primaryAction,
    generatedAt: now,
    contextFingerprint: fingerprint,
    significantFingerprint,
    fromCache: false,
  }
}

/**
 * Cheap refresh path: keep the same diagnosed situation, but rotate to another phrasing locally.
 */
export function buildLocallyRephrasedSnapshot(
  ctx: EmptyStateContext,
  cached: EmptyStateCacheEntry,
  options?: { beijingDate?: string; now?: number },
): EmptyStateSnapshot {
  const beijingDate = options?.beijingDate ?? getTodayDateString()
  const now = options?.now ?? Date.now()
  const suggestions = buildEmptyStateSuggestions(ctx)
  const primaryAction = suggestions.find((s) => s.primary) ?? suggestions[0]
  const variants = QUESTION_VARIANTS[cached.questionId] ?? [cached.questionKey]
  const nextVariant = variants.length > 1
    ? ((cached.questionVariant ?? 0) + 1) % variants.length
    : 0

  return {
    questionId: cached.questionId,
    questionKey: variants[nextVariant] ?? cached.questionKey,
    questionParams: cached.questionParams,
    questionVariant: nextVariant,
    prefillKey: cached.prefillKey,
    prefillParams: cached.prefillParams,
    contextLineKey: cached.contextLineKey,
    contextLineParams: cached.contextLineParams,
    suggestions,
    primaryAction,
    generatedAt: now,
    contextFingerprint: buildContextFingerprint(ctx, beijingDate),
    significantFingerprint: buildSignificantContextFingerprint(ctx, beijingDate),
    fromCache: false,
  }
}

/**
 * Apply agent-generated natural-language rethink result onto an existing snapshot.
 */
export function applyAgentRethinkResult(
  snapshot: EmptyStateSnapshot,
  rethink: { questionText?: string; contextLineText?: string } | null,
): EmptyStateSnapshot {
  if (!rethink?.questionText?.trim()) return snapshot
  return {
    ...snapshot,
    questionText: rethink.questionText.trim(),
    contextLineText: rethink.contextLineText?.trim(),
  }
}

export function cacheEntryFromSnapshot(
  workspacePath: string,
  snapshot: EmptyStateSnapshot,
  history: EmptyStateHistoryItem[],
): EmptyStateCacheEntry {
  return {
    workspacePath,
    generatedAt: snapshot.generatedAt,
    contextFingerprint: snapshot.contextFingerprint,
    significantFingerprint: snapshot.significantFingerprint,
    questionId: snapshot.questionId,
    questionKey: snapshot.questionKey,
    questionText: snapshot.questionText,
    questionParams: snapshot.questionParams,
    questionVariant: snapshot.questionVariant,
    prefillKey: snapshot.prefillKey,
    prefillParams: snapshot.prefillParams,
    contextLineKey: snapshot.contextLineKey,
    contextLineText: snapshot.contextLineText,
    contextLineParams: snapshot.contextLineParams,
    history,
  }
}

export function snapshotFromCacheEntry(
  entry: EmptyStateCacheEntry,
  ctx: EmptyStateContext,
): EmptyStateSnapshot {
  const suggestions = buildEmptyStateSuggestions(ctx)
  return {
    questionId: entry.questionId,
    questionKey: entry.questionKey,
    questionText: entry.questionText,
    questionParams: entry.questionParams,
    questionVariant: entry.questionVariant ?? 0,
    prefillKey: entry.prefillKey,
    prefillParams: entry.prefillParams,
    contextLineKey: entry.contextLineKey,
    contextLineText: entry.contextLineText,
    contextLineParams: entry.contextLineParams,
    suggestions,
    primaryAction: suggestions.find((s) => s.primary) ?? suggestions[0],
    generatedAt: entry.generatedAt,
    contextFingerprint: entry.contextFingerprint,
    significantFingerprint: entry.significantFingerprint ?? entry.contextFingerprint,
    fromCache: true,
  }
}

export function appendHistoryShown(
  history: EmptyStateHistoryItem[],
  questionId: string,
  now = Date.now(),
): EmptyStateHistoryItem[] {
  return [{ questionId, shownAt: now }, ...history].slice(0, EMPTY_STATE_HISTORY_MAX)
}

export function markHistoryActed(
  history: EmptyStateHistoryItem[],
  questionId: string,
  now = Date.now(),
): EmptyStateHistoryItem[] {
  return history.map((item) =>
    item.questionId === questionId && !item.actedAt ? { ...item, actedAt: now } : item,
  )
}

type CacheStore = Record<string, EmptyStateCacheEntry>

function readStore(): CacheStore {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as CacheStore
  } catch {
    return {}
  }
}

function writeStore(store: CacheStore): void {
  localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(store))
}

export async function readEmptyStateCache(workspacePath: string): Promise<EmptyStateCacheEntry | null> {
  const key = normalizeWorkspaceKey(workspacePath)
  return readStore()[key] ?? null
}

export async function writeEmptyStateCache(
  workspacePath: string,
  entry: EmptyStateCacheEntry,
): Promise<void> {
  const key = normalizeWorkspaceKey(workspacePath)
  const store = readStore()
  store[key] = entry
  writeStore(store)
  window.dispatchEvent(new CustomEvent('metamates:empty-state-updated'))
}

export async function recordEmptyStateShown(
  workspacePath: string,
  questionId: string,
): Promise<void> {
  const cached = await readEmptyStateCache(workspacePath)
  if (!cached) return
  const last = cached.history[0]
  if (last?.questionId === questionId && Date.now() - last.shownAt < 60_000) return
  const history = appendHistoryShown(cached.history, questionId)
  await writeEmptyStateCache(workspacePath, { ...cached, history })
}
