/**
 * Parse daily PLAN.md time blocks for status-bar / empty-state schedule.
 * Supports:
 * - Template: `## 🕒 时间块划分` + `- [ ] **09:00 - 11:00**：标题`
 * - MyM2 style: `⏰ 时间安排` + `- 09:00–12:00 — 标题` / `- 14:00 — 标题`
 */

export interface PlanTimeBlock {
  /** Display title (markdown light-stripped) */
  summary: string
  /** e.g. "09:00–11:00" */
  time: string
  startMinutes: number
  endMinutes: number
  done: boolean
}

const SECTION_END =
  /^(?:#{1,3}\s+|📋|💡|📌|🎯|━━━━━━━━|---|待办事项|今日提醒|今日不做什么|核心目标)/

function isTimeSectionHeading(trimmed: string): boolean {
  if (!trimmed || /^[-*]/.test(trimmed)) return false
  const hasKeyword =
    /时间块|时间安排|日程安排|Time\s*Blocks?|Time\s*Blocking|^Schedule\b/i.test(trimmed)
  if (!hasKeyword) return false
  // Headings only — not body lines that happen to mention 时间安排.
  return /^(?:#{1,3}\s+|⏰\s*)/.test(trimmed) || /^(?:时间安排|日程安排)$/i.test(trimmed)
}

/** `- [ ] **09:00 - 11:00**：标题` */
const TIME_BLOCK_CHECKBOX =
  /^[-*]\s+\[([ xX])\]\s+\*\*(\d{1,2}:\d{2})\s*[-–—~～]\s*(\d{1,2}:\d{2})\*\*\s*[:：]?\s*(.*)$/

/** `- [ ] 09:00 - 11:00：标题` */
const TIME_BLOCK_CHECKBOX_LOOSE =
  /^[-*]\s+\[([ xX])\]\s+(\d{1,2}:\d{2})\s*[-–—~～]\s*(\d{1,2}:\d{2})\s*[:：]\s*(.+)$/

/** `- 09:00–12:00 — 标题` or `- 09:00-12:00: 标题` (MyM2) */
const TIME_RANGE_PLAIN =
  /^[-*]\s+(\d{1,2}:\d{2})\s*[-–—~～]\s*(\d{1,2}:\d{2})\s*[—–\-:：]\s*(.+)$/

/** `- 14:00 — 标题` (single anchor time) */
const TIME_POINT_PLAIN =
  /^[-*]\s+(\d{1,2}:\d{2})\s*[—–\-:：]\s*(.+)$/

function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

function formatClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const mi = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** Strip light markdown wrappers from the summary tail. */
export function stripPlanBlockSummary(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function tryParseTimeBlockLine(line: string): PlanTimeBlock | null {
  const trimmed = line.trim()

  const checkbox = TIME_BLOCK_CHECKBOX.exec(trimmed) || TIME_BLOCK_CHECKBOX_LOOSE.exec(trimmed)
  if (checkbox) {
    const done = checkbox[1].toLowerCase() === 'x'
    const startMinutes = parseClock(checkbox[2])
    const endMinutes = parseClock(checkbox[3])
    if (startMinutes == null || endMinutes == null) return null
    const summary = stripPlanBlockSummary(checkbox[4] || '')
    if (!summary) return null
    return {
      summary,
      time: `${formatClock(startMinutes)}–${formatClock(endMinutes)}`,
      startMinutes,
      endMinutes,
      done,
    }
  }

  const range = TIME_RANGE_PLAIN.exec(trimmed)
  if (range) {
    const startMinutes = parseClock(range[1])
    const endMinutes = parseClock(range[2])
    if (startMinutes == null || endMinutes == null) return null
    const summary = stripPlanBlockSummary(range[3] || '')
    if (!summary) return null
    return {
      summary,
      time: `${formatClock(startMinutes)}–${formatClock(endMinutes)}`,
      startMinutes,
      endMinutes,
      done: false,
    }
  }

  const point = TIME_POINT_PLAIN.exec(trimmed)
  if (point) {
    const startMinutes = parseClock(point[1])
    if (startMinutes == null) return null
    const summary = stripPlanBlockSummary(point[2] || '')
    if (!summary) return null
    // Point events: show single clock; end = start (status bar still counts them).
    return {
      summary,
      time: formatClock(startMinutes),
      startMinutes,
      endMinutes: startMinutes,
      done: false,
    }
  }

  return null
}

/**
 * Extract time blocks from a daily PLAN markdown body.
 * Prefer lines under a time-block / 时间安排 heading; if no such heading exists,
 * accept matching time lines anywhere (older templates).
 */
export function parsePlanTimeBlocks(markdown: string): PlanTimeBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let inSection = false
  let sawHeading = false
  const sectionBlocks: PlanTimeBlock[] = []
  const allMatching: PlanTimeBlock[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (isTimeSectionHeading(trimmed)) {
      inSection = true
      sawHeading = true
      continue
    }

    if (inSection && SECTION_END.test(trimmed) && !isTimeSectionHeading(trimmed)) {
      // Don't exit on period labels like **上午** / **下午**
      if (!/^\*\*(上午|中午|下午|晚上|Morning|Afternoon|Evening)\*\*$/i.test(trimmed)) {
        inSection = false
        continue
      }
    }

    const block = tryParseTimeBlockLine(line)
    if (!block) continue
    allMatching.push(block)
    if (inSection) sectionBlocks.push(block)
  }

  const result = sawHeading ? sectionBlocks : allMatching
  return result.sort((a, b) => a.startMinutes - b.startMinutes)
}
