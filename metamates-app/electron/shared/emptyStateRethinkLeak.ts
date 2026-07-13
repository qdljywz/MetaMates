/**
 * Detect / recover empty-state background rethink JSON that leaked into user-visible UI.
 */

const RETHINK_JSON_BODY = /\{\s*["']questionText[^"']*["']\s*:\s*["']/i

export function isEmptyStateRethinkJsonLeak(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^\[\s*background-empty-state\s*\]/i.test(trimmed)) return true
  if (/^\{\s*["']questionText/i.test(trimmed)) return true
  if (RETHINK_JSON_BODY.test(trimmed)) return true
  return false
}

/** Extract questionText value from complete or truncated rethink JSON. */
export function extractPartialQuestionText(text: string): string | null {
  const match = text.match(/"questionText[^"]*"\s*:\s*"((?:[^"\\]|\\.)*)/i)
  if (!match?.[1]) return null
  return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim() || null
}

export function normalizeEmptyStateQuestionText(text: string | undefined): string | undefined {
  const trimmed = text?.trim()
  if (!trimmed) return undefined
  if (!isEmptyStateRethinkJsonLeak(trimmed)) return trimmed
  return extractPartialQuestionText(trimmed) ?? undefined
}

/** Agent chat should hide rethink JSON entirely (not show extracted question). */
export function shouldHideAgentRethinkLeak(text: string | undefined): boolean {
  if (!text?.trim()) return false
  return isEmptyStateRethinkJsonLeak(text)
}
