/**
 * Text normalization for ACP agent chunks (AionUi normalizeTextMessageContent + MetaMates sanitizers).
 */

export function unescapeLiteralEscapes(text: string): string {
  if (!text.includes('\\n') && !text.includes('\\r') && !text.includes('\\t')) return text
  const literalCount = (text.match(/\\n/g) || []).length
  const realNewlines = (text.match(/\n/g) || []).length
  if (literalCount <= realNewlines) return text
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
}

/** Strip leaked write_file JSON; preserve leading/trailing spaces for stream chunk concat. */
export function sanitizeAgentStreamChunk(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('{') || trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      const inner =
        (typeof parsed.content === 'string' && parsed.content)
        || (typeof parsed.text === 'string' && parsed.text)
        || (typeof parsed.new_content === 'string' && parsed.new_content)
        || (typeof parsed.newContent === 'string' && parsed.newContent)
      if (inner) return unescapeLiteralEscapes(inner)
      if ('file_path' in parsed || 'filePath' in parsed || 'path' in parsed) return ''
    } catch {
      const contentMatch = trimmed.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/s)
      if (contentMatch?.[1]) {
        try {
          return unescapeLiteralEscapes(JSON.parse(`"${contentMatch[1]}"`))
        } catch {
          // fall through
        }
      }
    }
  }

  return unescapeLiteralEscapes(raw)
}

/** Full agent bubble sanitization (trimmed display). */
export function sanitizeAgentDisplayText(raw: string): string {
  return sanitizeAgentStreamChunk(raw.trim())
}

export function extractAcpTextChunk(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return sanitizeAgentStreamChunk(content)
  if (typeof content === 'object' && content !== null) {
    const record = content as { type?: string; text?: string; content?: unknown }
    if (record.type === 'text' && typeof record.text === 'string') {
      return sanitizeAgentStreamChunk(record.text)
    }
    if (record.content) return extractAcpTextChunk(record.content)
  }
  return ''
}

export function extractEchoedUserText(content: unknown): string {
  const raw = extractAcpTextChunk(content)
  if (!raw) return ''
  const userRequestMatch = raw.match(/\[User Request\]\n([\s\S]*)$/)
  return (userRequestMatch?.[1] || raw).trim()
}
