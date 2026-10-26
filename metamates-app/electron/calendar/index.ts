import * as fs from 'fs'
import * as path from 'path'
import {
  parseIcsEvents,
  getTodayEvents,
  getEventsForDate,
  formatEventTime,
  type CalendarEvent,
} from './icsParser'
import { parsePlanTimeBlocks } from './planTimeBlocks'
import {
  detectWorkspaceLanguage,
  getLayout,
  LEGACY_PATHS,
} from '../workspaceLayout'

export type { CalendarEvent }

export interface CalendarSummaryEvent {
  summary: string
  time: string
  location?: string
  /** Origin for UI / debug */
  origin?: 'plan' | 'ics'
}

/**
 * 从文件路径加载日历事件
 */
export function loadCalendarFromFile(icsPath: string): CalendarEvent[] {
  if (!fs.existsSync(icsPath)) return []
  const content = fs.readFileSync(icsPath, 'utf-8')
  return parseIcsEvents(content)
}

/**
 * 在工作区中自动查找 .ics 文件
 */
export function findIcsFilesInWorkspace(workspacePath: string): string[] {
  const results: string[] = []

  function walk(dir: string, depth = 0): void {
    if (depth > 4) return
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      if (item.name.startsWith('.')) continue
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        walk(full, depth + 1)
      } else if (item.name.endsWith('.ics')) {
        results.push(full)
      }
    }
  }

  walk(workspacePath)
  return results
}

/**
 * 解析 ICS：优先用户指定路径，否则扫描工作区第一个 .ics
 */
export function resolveCalendarEvents(
  workspacePath: string,
  icsPath?: string
): { events: CalendarEvent[]; source: string | null } {
  if (icsPath && fs.existsSync(icsPath)) {
    return { events: loadCalendarFromFile(icsPath), source: icsPath }
  }

  const found = findIcsFilesInWorkspace(workspacePath)
  if (found.length > 0) {
    return { events: loadCalendarFromFile(found[0]), source: found[0] }
  }

  return { events: [], source: null }
}

/** YYYY-MM-DD PLAN.md candidates under zh/en + legacy dirs. */
export function resolveDailyPlanFilePath(
  workspacePath: string,
  dateStr: string,
): string | null {
  const language = detectWorkspaceLanguage(workspacePath)
  const layout = getLayout(language)
  const fileName = `${dateStr} PLAN.md`
  const candidates = [
    path.join(workspacePath, layout.LOG_AND_PLAN, fileName),
    path.join(workspacePath, layout.LOG_AND_PLAN, layout.INBOX, fileName),
    path.join(workspacePath, LEGACY_PATHS.DAILY_PLAN_DIR, fileName),
  ]
  // Also try the other language layout if marker detection was wrong / dual vault.
  const other = language === 'zh' ? getLayout('en') : getLayout('zh')
  candidates.push(
    path.join(workspacePath, other.LOG_AND_PLAN, fileName),
    path.join(workspacePath, other.LOG_AND_PLAN, other.INBOX, fileName),
  )

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export function loadPlanTimeBlockEvents(
  workspacePath: string,
  dateStr: string,
): { events: CalendarSummaryEvent[]; planPath: string | null } {
  const planPath = resolveDailyPlanFilePath(workspacePath, dateStr)
  if (!planPath) return { events: [], planPath: null }
  let content: string
  try {
    content = fs.readFileSync(planPath, 'utf-8')
  } catch {
    return { events: [], planPath }
  }
  const blocks = parsePlanTimeBlocks(content)
  return {
    planPath,
    events: blocks.map((b) => ({
      summary: b.summary,
      time: b.time,
      origin: 'plan' as const,
    })),
  }
}

function shanghaiDateString(date?: Date): string {
  const d = date || new Date()
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

/**
 * Status-bar / empty-state schedule:
 * 1) Today's PLAN.md time blocks (primary)
 * 2) Optional .ics overlay (settings path or first vault .ics)
 */
export function getCalendarSummary(
  workspacePath: string,
  icsPath?: string,
  date?: Date
): {
  events: CalendarSummaryEvent[]
  source: string | null
  planSource: string | null
  icsSource: string | null
  date: string
} {
  const dateStr = shanghaiDateString(date)
  const { events: planEvents, planPath } = loadPlanTimeBlockEvents(workspacePath, dateStr)

  const { events: icsAll, source: icsSource } = resolveCalendarEvents(workspacePath, icsPath)
  const targetDate = date || (() => {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  })()
  const dayIcs = date
    ? getEventsForDate(icsAll, targetDate)
    : getTodayEvents(icsAll)

  const icsEvents: CalendarSummaryEvent[] = dayIcs.map((e) => ({
    summary: e.summary,
    time: formatEventTime(e),
    location: e.location,
    origin: 'ics' as const,
  }))

  // PLAN first (vault-native), then ICS; light dedupe on same time+summary.
  const seen = new Set<string>()
  const events: CalendarSummaryEvent[] = []
  for (const e of [...planEvents, ...icsEvents]) {
    const key = `${e.time}|${e.summary}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    events.push(e)
  }

  const source = planPath || icsSource

  return {
    date: dateStr,
    source,
    planSource: planPath,
    icsSource,
    events,
  }
}
