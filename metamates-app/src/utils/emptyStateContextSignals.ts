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
  return pickRecentFocusFile(recentFiles)?.label
}

/** First human-meaningful recent note (path + label). */
export function pickRecentFocusFile(
  recentFiles: { path: string; name: string }[],
): { path: string; label: string } | undefined {
  for (const file of recentFiles) {
    if (file.name.toLowerCase().endsWith(' plan.md')) continue
    if (isNoiseRecentFile(file.name)) continue
    if (/^20\d{2}-\d{2}-\d{2}\.md$/i.test(file.name)) continue
    return {
      path: file.path,
      label: file.name.replace(/\.md$/i, ''),
    }
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

export function pickLatestIdeasReportFile(
  files: Array<{ name: string; path?: string; isDirectory?: boolean }>,
): { label: string; path?: string } | undefined {
  const candidate = [...files]
    .filter((f) => !f.isDirectory && /^ideas_report/i.test(f.name) && f.name.toLowerCase().endsWith('.md'))
    .sort((a, b) => b.name.localeCompare(a.name))[0]
  if (!candidate) return undefined
  return {
    label: candidate.name.replace(/\.md$/i, ''),
    path: candidate.path,
  }
}

function isIdeasReportBoilerplate(text: string): boolean {
  const stripped = text
    .replace(/[`:*_💡\u{1F4A1}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return true
  if (/^ideas[_\s-]*report/i.test(stripped)) return true
  if (/^点子报告/i.test(stripped)) return true
  if (/^ideas report/i.test(stripped)) return true
  return false
}

export function extractIdeasReportSummary(content: string): string | undefined {
  const lines = content.split(/\r?\n/)
  let inCodeBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    const headingText = heading?.[1]?.trim()
    if (headingText) {
      if (!isIdeasReportBoilerplate(headingText)) {
        return headingText.slice(0, 120)
      }
      continue
    }

    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^-\s*\[[ xX]\]\s*/, '')
      .replace(/[`*_]/g, '')
      .trim()
    if (cleaned && !isIdeasReportBoilerplate(cleaned)) {
      return cleaned.slice(0, 120)
    }
  }
  return undefined
}

export function extractIdeasReportPreview(content: string): string | undefined {
  const lines = content.split(/\r?\n/)
  let inCodeBlock = false
  const bullets: string[] = []
  const headings: string[] = []
  let totalLen = 0
  const maxTotalChars = 320

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (/^[-*_]{3,}$/.test(line)) continue

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    const headingText = heading?.[1]?.trim()
    if (headingText) {
      if (!isIdeasReportBoilerplate(headingText) && headings.length < 2 && totalLen < maxTotalChars) {
        const cleaned = headingText.replace(/[`:*_]/g, '').trim()
        if (cleaned) {
          headings.push(cleaned.slice(0, 90))
          totalLen += headings[headings.length - 1]!.length
        }
      }
      continue
    }

    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^-\s*\[[ xX]\]\s*/i, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/[`*_]/g, '')
      .trim()

    if (!cleaned || isIdeasReportBoilerplate(cleaned)) continue
    if (totalLen + cleaned.length > maxTotalChars) {
      bullets.push(cleaned.slice(0, Math.max(0, maxTotalChars - totalLen)))
      break
    }
    bullets.push(cleaned)
    totalLen += cleaned.length
    if (bullets.length >= 4) break
  }

  const picked = bullets.length > 0 ? bullets : headings
  return picked.length > 0 ? picked.join('\n') : undefined
}

/** First heading or paragraph from a generic markdown note. */
export function extractMarkdownSummary(content: string): string | undefined {
  const lines = content.split(/\r?\n/)
  let inCodeBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading?.[1]) return heading[1].trim().slice(0, 120)

    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^-\s*\[[ xX]\]\s*/, '')
      .replace(/[`*_]/g, '')
      .trim()
    if (cleaned) return cleaned.slice(0, 120)
  }
  return undefined
}

/** Short multi-line preview for hover cards. */
export function extractMarkdownPreview(content: string, maxTotalChars = 280): string | undefined {
  const lines = content.split(/\r?\n/)
  let inCodeBlock = false
  const bullets: string[] = []
  const headings: string[] = []
  let totalLen = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (/^[-*_]{3,}$/.test(line)) continue

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading?.[1]) {
      const cleaned = heading[1].replace(/[`:*_]/g, '').trim()
      if (cleaned && headings.length < 1 && totalLen < maxTotalChars) {
        headings.push(cleaned.slice(0, 90))
        totalLen += headings[headings.length - 1]!.length
      }
      continue
    }

    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^-\s*\[[ xX]\]\s*/i, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/[`*_]/g, '')
      .trim()

    if (!cleaned) continue
    if (totalLen + cleaned.length > maxTotalChars) {
      bullets.push(cleaned.slice(0, Math.max(0, maxTotalChars - totalLen)))
      break
    }
    bullets.push(cleaned)
    totalLen += cleaned.length
    if (bullets.length >= 4) break
  }

  const picked = bullets.length > 0 ? bullets : headings
  return picked.length > 0 ? picked.join('\n') : undefined
}

/** Unchecked PLAN items joined for hover preview. */
export function extractPlanPreview(content: string): string | undefined {
  const openTasks: string[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const open = rawLine.trim().match(OPEN_TASK_RE)
    if (!open?.[1]) continue
    openTasks.push(sanitizeTaskLabel(open[1]))
    if (openTasks.length >= 3) break
  }
  return openTasks.length > 0 ? openTasks.join(' · ') : undefined
}

export function inboxQuestionPriority(inboxCount: number): number {
  if (inboxCount <= 0) return 0
  if (inboxCount <= 5) return 84
  if (inboxCount <= 12) return 76
  return 68
}
