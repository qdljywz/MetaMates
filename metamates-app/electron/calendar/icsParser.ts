/**
 * 轻量级 iCalendar (.ics) 解析器（VEVENT）
 */

export interface CalendarEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  start: Date
  end?: Date
  allDay: boolean
}

/**
 * 展开 ICS 折叠行
 */
function unfoldIcs(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

function parseIcsDate(value: string): Date {
  const cleaned = value.trim()
  if (/^\d{8}$/.test(cleaned)) {
    const y = parseInt(cleaned.slice(0, 4), 10)
    const m = parseInt(cleaned.slice(4, 6), 10) - 1
    const d = parseInt(cleaned.slice(6, 8), 10)
    return new Date(y, m, d)
  }
  if (/^\d{8}T\d{6}Z?$/.test(cleaned)) {
    const y = parseInt(cleaned.slice(0, 4), 10)
    const mo = parseInt(cleaned.slice(4, 6), 10) - 1
    const d = parseInt(cleaned.slice(6, 8), 10)
    const h = parseInt(cleaned.slice(9, 11), 10)
    const mi = parseInt(cleaned.slice(11, 13), 10)
    const s = parseInt(cleaned.slice(13, 15), 10)
    if (cleaned.endsWith('Z')) {
      return new Date(Date.UTC(y, mo, d, h, mi, s))
    }
    return new Date(y, mo, d, h, mi, s)
  }
  const parsed = new Date(cleaned)
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

function extractPropertyValue(line: string): string {
  const colonIdx = line.indexOf(':')
  if (colonIdx < 0) return ''
  let value = line.slice(colonIdx + 1)
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }
  return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\')
}

export function parseIcsEvents(content: string): CalendarEvent[] {
  const unfolded = unfoldIcs(content)
  const events: CalendarEvent[] = []
  const blocks = unfolded.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0]
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)

    let uid = ''
    let summary = ''
    let description = ''
    let location = ''
    let dtStart = ''
    let dtEnd = ''
    let allDay = false

    for (const line of lines) {
      const upper = line.toUpperCase()
      if (upper.startsWith('UID')) uid = extractPropertyValue(line)
      else if (upper.startsWith('SUMMARY')) summary = extractPropertyValue(line)
      else if (upper.startsWith('DESCRIPTION')) description = extractPropertyValue(line)
      else if (upper.startsWith('LOCATION')) location = extractPropertyValue(line)
      else if (upper.startsWith('DTSTART')) {
        dtStart = extractPropertyValue(line)
        allDay = !dtStart.includes('T')
      } else if (upper.startsWith('DTEND')) {
        dtEnd = extractPropertyValue(line)
      }
    }

    if (!dtStart) continue

    events.push({
      uid: uid || `event-${i}`,
      summary: summary || '(无标题)',
      description: description || undefined,
      location: location || undefined,
      start: parseIcsDate(dtStart),
      end: dtEnd ? parseIcsDate(dtEnd) : undefined,
      allDay,
    })
  }

  return events
}

/**
 * 获取指定日期（本地时区）的事件
 */
export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const targetY = date.getFullYear()
  const targetM = date.getMonth()
  const targetD = date.getDate()

  return events.filter((event) => {
    const start = event.start
    if (event.allDay) {
      return (
        start.getFullYear() === targetY &&
        start.getMonth() === targetM &&
        start.getDate() === targetD
      )
    }
    const end = event.end || event.start
    const dayStart = new Date(targetY, targetM, targetD, 0, 0, 0)
    const dayEnd = new Date(targetY, targetM, targetD, 23, 59, 59)
    return start <= dayEnd && end >= dayStart
  }).sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * 获取今日事件（北京时间）
 */
export function getTodayEvents(events: CalendarEvent[]): CalendarEvent[] {
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  const [y, m, d] = todayStr.split('-').map(Number)
  return getEventsForDate(events, new Date(y, m - 1, d))
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return '全天'
  const h = event.start.getHours().toString().padStart(2, '0')
  const mi = event.start.getMinutes().toString().padStart(2, '0')
  return `${h}:${mi}`
}
