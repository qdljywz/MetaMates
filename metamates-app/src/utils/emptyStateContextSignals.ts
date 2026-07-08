export interface PlanSignals {
  uncheckedCount: number
  checkedCount: number
  firstOpenTask?: string
  headline?: string
}

const OPEN_TASK_RE = /^-\s*\[\s\]\s*(.+)$/
const DONE_TASK_RE = /^-\s*\[[xX]\]\s*(.+)$/
const HEADING_RE = /^#{1,3}\s+(.+)$/

/**
 * Extract actionable cues from today's PLAN markdown (checkboxes + first heading).
 */
export function parsePlanSignals(content: string): PlanSignals {
  let uncheckedCount = 0
  let checkedCount = 0
  let firstOpenTask: string | undefined
  let headline: string | undefined

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (!headline) {
      const heading = line.match(HEADING_RE)
      if (heading?.[1]) headline = heading[1].trim()
    }

    const open = line.match(OPEN_TASK_RE)
    if (open?.[1]) {
      uncheckedCount += 1
      if (!firstOpenTask) {
        firstOpenTask = sanitizeTaskLabel(open[1])
      }
      continue
    }

    const done = line.match(DONE_TASK_RE)
    if (done?.[1]) checkedCount += 1
  }

  return { uncheckedCount, checkedCount, firstOpenTask, headline }
}

function sanitizeTaskLabel(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/^\d{1,2}:\d{2}\s*[-–—]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72)
}

/** Skip E2E seeds and inbox noise when picking a human-meaningful "recent focus". */
export function isNoiseRecentFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.startsWith('_e2e_')
    || lower.includes('e2e-link-seed')
    || lower.includes('e2e_rethink')
    || lower.includes('test capture')
  )
}

export function pickRecentFocusLabel(
  recentFiles: { path: string; name: string }[],
): string | undefined {
  for (const file of recentFiles) {
    if (file.name.toLowerCase().endsWith(' plan.md')) continue
    if (isNoiseRecentFile(file.name)) continue
    if (/^20\d{2}-\d{2}-\d{2}\.md$/i.test(file.name)) continue
    return file.name.replace(/\.md$/i, '')
  }
  return undefined
}

/** Most recent Ideas_Report note in insights folder (by filename date suffix). */
export function pickIdeasReportLabel(
  files: Array<{ name: string; isDirectory?: boolean }>,
): string | undefined {
  const candidates = files
    .filter((f) => !f.isDirectory && /^ideas_report/i.test(f.name) && f.name.toLowerCase().endsWith('.md'))
    .map((f) => f.name.replace(/\.md$/i, ''))
    .sort((a, b) => b.localeCompare(a))
  return candidates[0]
}

export function inboxQuestionPriority(inboxCount: number): number {
  if (inboxCount <= 0) return 0
  if (inboxCount <= 5) return 84
  if (inboxCount <= 12) return 76
  return 68
}
