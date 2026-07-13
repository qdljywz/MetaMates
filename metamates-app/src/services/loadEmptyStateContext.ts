import {
  getCurrentHour,
  getTodayDateString,
  getWorkspaceLanguage,
  getWorkspaceLayout,
  resolveDailyNotePath,
  resolveDailyPlanPath,
  resolveInboxDirPath,
  resolveUserTimezone,
} from '../constants/paths'
import { storageService, type AppSettings } from '../services/storage'
import type { EmptyStateContext } from '../utils/editorEmptyState'
import {
  extractIdeasReportPreview,
  extractIdeasReportSummary,
  extractMarkdownPreview,
  extractMarkdownSummary,
  extractPlanPreview,
  parsePlanSignals,
  pickLatestIdeasReportFile,
  pickRecentFocusFile,
} from '../utils/emptyStateContextSignals'
import type { WelcomeAgentHint } from '../utils/welcomeContent'
import { normalizeEngineDisplayName } from '../utils/engineDisplayName'

function emptyContext(
  agentHint: WelcomeAgentHint,
  hour: number,
  settings: Partial<AppSettings> = {},
): EmptyStateContext {
  return {
    hasWorkspace: false,
    isReturningUser: false,
    hour,
    agentHint,
    todayPlanExists: false,
    todayNoteExists: false,
    inboxCount: 0,
    planUncheckedCount: 0,
    planCheckedCount: 0,
    scheduleTodayCount: 0,
    recentFiles: [],
    engineDisplayName: normalizeEngineDisplayName(settings.engineDisplayName ?? '') || undefined,
    engineNamingSkippedAt: settings.engineNamingSkippedAt,
    engineNamingPromptCount: settings.engineNamingPromptCount ?? 0,
  }
}

async function readNoteExcerpt(
  api: NonNullable<typeof window.electronAPI>,
  filePath: string,
): Promise<{ summary?: string; preview?: string }> {
  const read = await api.readFile(filePath)
  if (!read.success || typeof read.content !== 'string') return {}
  return {
    summary: extractMarkdownSummary(read.content),
    preview: extractMarkdownPreview(read.content),
  }
}

export async function loadEmptyStateContext(
  workspacePath: string | undefined,
  agentHint: WelcomeAgentHint,
): Promise<EmptyStateContext> {
  const settings: Partial<AppSettings> = await storageService.getSettings().catch(
    () => ({} as Partial<AppSettings>),
  )
  const timezone = resolveUserTimezone(settings.userTimezone)
  const hour = getCurrentHour(timezone)
  if (!workspacePath?.trim()) {
    return emptyContext(agentHint, hour, settings)
  }

  const api = window.electronAPI
  const language = getWorkspaceLanguage(
    typeof navigator !== 'undefined' ? navigator.language : 'zh',
  )
  const layout = getWorkspaceLayout(language)
  const today = getTodayDateString(timezone)
  const calendarIcsPath = settings.calendarIcsPath || undefined

  let recentFiles: { path: string; name: string }[] = []
  try {
    const wsNorm = workspacePath.replace(/\\/g, '/').toLowerCase()
    recentFiles = (settings.recentFiles || [])
      .filter((p: string) => p.replace(/\\/g, '/').toLowerCase().startsWith(wsNorm))
      .slice(0, 5)
      .map((path: string) => ({
        path,
        name: path.split(/[/\\]/).pop() || path,
      }))
  } catch {
    recentFiles = []
  }

  const recentFocus = pickRecentFocusFile(recentFiles)

  let todayPlanExists = false
  let todayNoteExists = false
  let todayPlanPath: string | undefined
  let todayNotePath: string | undefined
  let inboxCount = 0
  let planUncheckedCount = 0
  let planCheckedCount = 0
  let planFirstOpenTask: string | undefined
  let planHeadline: string | undefined
  let planPreview: string | undefined
  let scheduleTodayCount = 0
  let scheduleNextSummary: string | undefined
  let scheduleNextTime: string | undefined
  let schedulePreview: string | undefined
  let recentIdeasLabel: string | undefined
  let recentIdeasPath: string | undefined
  let recentIdeasSummary: string | undefined
  let recentIdeasPreview: string | undefined
  let recentFocusLabel = recentFocus?.label
  let recentFocusPath = recentFocus?.path
  let recentFocusSummary: string | undefined
  let recentFocusPreview: string | undefined
  let inboxSamplePath: string | undefined
  let inboxSampleLabel: string | undefined
  let inboxSampleSummary: string | undefined
  let inboxSamplePreview: string | undefined
  let todayNoteSummary: string | undefined
  let todayNotePreview: string | undefined

  if (api) {
    try {
      todayPlanPath = await resolveDailyPlanPath(workspacePath, today, language)
      todayNotePath = await resolveDailyNotePath(workspacePath, today, language)
      todayPlanExists = (await api.fileExists(todayPlanPath)).exists === true
      todayNoteExists = (await api.fileExists(todayNotePath)).exists === true

      if (todayPlanExists) {
        const planRead = await api.readFile(todayPlanPath)
        if (planRead.success && typeof planRead.content === 'string') {
          const planSignals = parsePlanSignals(planRead.content)
          planUncheckedCount = planSignals.uncheckedCount
          planCheckedCount = planSignals.checkedCount
          planFirstOpenTask = planSignals.firstOpenTask
          planHeadline = planSignals.headline
          planPreview = extractPlanPreview(planRead.content)
        }
      }

      if (todayNoteExists && todayNotePath) {
        const noteExcerpt = await readNoteExcerpt(api, todayNotePath)
        todayNoteSummary = noteExcerpt.summary
        todayNotePreview = noteExcerpt.preview
      }

      const inboxDir = await resolveInboxDirPath(workspacePath, language)
      const inboxList = await api.listFiles(inboxDir, false)
      if (inboxList.success && inboxList.files) {
        const inboxMd = inboxList.files
          .filter((f) => !f.isDirectory && f.name.toLowerCase().endsWith('.md'))
          .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))
        inboxCount = inboxMd.length
        const sample = inboxMd[0]
        if (sample?.path) {
          inboxSamplePath = sample.path
          inboxSampleLabel = sample.name.replace(/\.md$/i, '')
          const inboxExcerpt = await readNoteExcerpt(api, sample.path)
          inboxSampleSummary = inboxExcerpt.summary
          inboxSamplePreview = inboxExcerpt.preview
        }
      }

      if (api.calendar?.getEvents) {
        const calendar = await api.calendar.getEvents(
          workspacePath,
          calendarIcsPath,
          today,
        )
        if (calendar.success && calendar.events.length > 0) {
          scheduleTodayCount = calendar.events.length
          scheduleNextSummary = calendar.events[0]?.summary
          scheduleNextTime = calendar.events[0]?.time
          schedulePreview = calendar.events
            .slice(0, 3)
            .map((event) => `${event.time} ${event.summary}`.trim())
            .join(' · ')
        }
      }

      if (recentFocusPath) {
        const focusExcerpt = await readNoteExcerpt(api, recentFocusPath)
        recentFocusSummary = focusExcerpt.summary
        recentFocusPreview = focusExcerpt.preview
      }

      if (api.path?.join) {
        const insightsDir = await api.path.join(workspacePath, layout.INSIGHTS)
        const insightsList = await api.listFiles(insightsDir, false)
        if (insightsList.success && insightsList.files) {
          const reportFile = pickLatestIdeasReportFile(insightsList.files)
          recentIdeasLabel = reportFile?.label
          recentIdeasPath = reportFile?.path
          if (recentIdeasPath) {
            const reportRead = await api.readFile(recentIdeasPath)
            if (reportRead.success && typeof reportRead.content === 'string') {
              recentIdeasSummary = extractIdeasReportSummary(reportRead.content)
              recentIdeasPreview = extractIdeasReportPreview(reportRead.content)
            }
          }
        }
      }
    } catch {
      // keep defaults
    }
  }

  const isReturningUser =
    recentFiles.length > 0
    || todayPlanExists
    || todayNoteExists
    || inboxCount > 0
    || scheduleTodayCount > 0
    || !!recentIdeasLabel

  return {
    hasWorkspace: true,
    isReturningUser,
    hour,
    agentHint,
    todayPlanExists,
    todayNoteExists,
    todayPlanPath,
    todayNotePath,
    inboxCount,
    planUncheckedCount,
    planCheckedCount,
    planFirstOpenTask,
    planHeadline,
    planPreview,
    scheduleTodayCount,
    scheduleNextSummary,
    scheduleNextTime,
    schedulePreview,
    calendarIcsPath,
    recentIdeasLabel,
    recentIdeasPath,
    recentIdeasSummary,
    recentIdeasPreview,
    recentFocusLabel,
    recentFocusPath,
    recentFocusSummary,
    recentFocusPreview,
    inboxSamplePath,
    inboxSampleLabel,
    inboxSampleSummary,
    inboxSamplePreview,
    todayNoteSummary,
    todayNotePreview,
    recentFiles,
    engineDisplayName: normalizeEngineDisplayName(settings.engineDisplayName ?? '') || undefined,
    engineNamingSkippedAt: settings.engineNamingSkippedAt,
    engineNamingPromptCount: settings.engineNamingPromptCount ?? 0,
  }
}
