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
  parsePlanSignals,
  pickIdeasReportLabel,
  pickRecentFocusLabel,
} from '../utils/emptyStateContextSignals'
import type { WelcomeAgentHint } from '../utils/welcomeContent'

function emptyContext(agentHint: WelcomeAgentHint, hour: number): EmptyStateContext {
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
    return emptyContext(agentHint, hour)
  }

  const api = window.electronAPI
  const language = getWorkspaceLanguage(
    typeof navigator !== 'undefined' ? navigator.language : 'zh',
  )
  const layout = getWorkspaceLayout(language)
  const today = getTodayDateString(timezone)

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

  let todayPlanExists = false
  let todayNoteExists = false
  let todayPlanPath: string | undefined
  let todayNotePath: string | undefined
  let inboxCount = 0
  let planUncheckedCount = 0
  let planCheckedCount = 0
  let planFirstOpenTask: string | undefined
  let planHeadline: string | undefined
  let scheduleTodayCount = 0
  let scheduleNextSummary: string | undefined
  let scheduleNextTime: string | undefined
  let recentIdeasLabel: string | undefined
  const recentFocusLabel = pickRecentFocusLabel(recentFiles)

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
        }
      }

      const inboxDir = await resolveInboxDirPath(workspacePath, language)
      const inboxList = await api.listFiles(inboxDir, false)
      if (inboxList.success && inboxList.files) {
        inboxCount = inboxList.files.filter(
          (f) => !f.isDirectory && f.name.toLowerCase().endsWith('.md'),
        ).length
      }

      if (api.calendar?.getEvents) {
        const calendar = await api.calendar.getEvents(
          workspacePath,
          settings.calendarIcsPath || undefined,
          today,
        )
        if (calendar.success && calendar.events.length > 0) {
          scheduleTodayCount = calendar.events.length
          scheduleNextSummary = calendar.events[0]?.summary
          scheduleNextTime = calendar.events[0]?.time
        }
      }

      if (api.path?.join) {
        const insightsDir = await api.path.join(workspacePath, layout.INSIGHTS)
        const insightsList = await api.listFiles(insightsDir, false)
        if (insightsList.success && insightsList.files) {
          recentIdeasLabel = pickIdeasReportLabel(insightsList.files)
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
    scheduleTodayCount,
    scheduleNextSummary,
    scheduleNextTime,
    recentIdeasLabel,
    recentFocusLabel,
    recentFiles,
  }
}
