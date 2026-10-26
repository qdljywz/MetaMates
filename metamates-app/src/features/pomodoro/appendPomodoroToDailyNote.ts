/**
 * Append a completed focus session line under ## 番茄钟 / ## Pomodoro in today's diary.
 */

export interface PomodoroDiaryLineInput {
  startedAt: Date
  endedAt: Date
  durationMin: number
  note: string
  /** Prefer zh headings when language starts with zh. */
  language?: string
}

/**
 * Format HH:mm in local time.
 */
export function formatLocalHm(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Build a single markdown list item for a pomodoro session.
 */
export function formatPomodoroDiaryLine(input: PomodoroDiaryLineInput): string {
  const start = formatLocalHm(input.startedAt)
  const end = formatLocalHm(input.endedAt)
  const mins = Math.max(1, Math.round(input.durationMin))
  const note = input.note.trim()
  const suffix = note ? ` ${note}` : ''
  return `- [x] ${start}–${end} (${mins}m)${suffix}`
}

/**
 * Section heading for the diary language.
 */
export function pomodoroSectionHeading(language?: string): string {
  const lang = (language || 'zh').toLowerCase()
  return lang.startsWith('en') ? '## Pomodoro' : '## 番茄钟'
}

const SECTION_RE = /^##\s*(番茄钟|Pomodoro)\s*$/im

/**
 * Insert or append a pomodoro line under the dedicated section.
 * @returns Updated markdown body
 */
export function appendPomodoroLineToMarkdown(
  existingContent: string,
  line: string,
  language?: string,
): string {
  const body = existingContent.replace(/\s+$/, '')
  const heading = pomodoroSectionHeading(language)
  const match = body.match(SECTION_RE)

  if (!match || match.index == null) {
    const sep = body.length > 0 ? '\n\n' : ''
    return `${body}${sep}${heading}\n\n${line}\n`
  }

  const start = match.index + match[0].length
  let end = body.length
  const after = body.slice(start)
  const nextHeading = after.search(/\n##\s+/)
  if (nextHeading >= 0) {
    end = start + nextHeading
  }

  const sectionBody = body.slice(start, end).replace(/^\n+/, '').replace(/\s+$/, '')
  const newSection = sectionBody
    ? `\n\n${sectionBody}\n${line}\n`
    : `\n\n${line}\n`
  return `${body.slice(0, start)}${newSection}${body.slice(end)}`
}
