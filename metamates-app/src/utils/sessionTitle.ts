export interface SessionTitleMessage {
  type: string
  content?: string
}

export function deriveSessionTitle(
  messages: SessionTitleMessage[],
  fallback: string,
  maxLength = 42
): string {
  const firstUser = messages.find((msg) => msg.type === 'user' && msg.content?.trim())
  if (!firstUser?.content) return fallback
  const text = firstUser.content.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

export function countUserMessages(messages: SessionTitleMessage[]): number {
  return messages.filter((msg) => msg.type === 'user').length
}
