import * as fs from 'fs'
import * as path from 'path'
import {
  parseIcsEvents,
  getTodayEvents,
  getEventsForDate,
  formatEventTime,
  type CalendarEvent,
} from './icsParser'

export type { CalendarEvent }

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
 * 解析日历：优先用户指定路径，否则扫描工作区第一个 .ics
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

export function getCalendarSummary(
  workspacePath: string,
  icsPath?: string,
  date?: Date
): {
  events: Array<{ summary: string; time: string; location?: string }>
  source: string | null
  date: string
} {
  const { events, source } = resolveCalendarEvents(workspacePath, icsPath)
  const targetDate = date || new Date()
  const dayEvents = date
    ? getEventsForDate(events, targetDate)
    : getTodayEvents(events)

  const dateStr = targetDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

  return {
    date: dateStr,
    source,
    events: dayEvents.map((e) => ({
      summary: e.summary,
      time: formatEventTime(e),
      location: e.location,
    })),
  }
}
