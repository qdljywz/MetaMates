import {
  isToolCallInProgress,
  isToolCallTerminal,
  mergeToolCallStatus,
} from '../../utils/toolCallStatus'

export interface ChatBubble {
  id: string
  type: string
  content?: string
  toolCallId?: string
  title?: string
  status?: string
  msg_id?: string
  position?: string
  kind?: string
  rawInput?: unknown
  /** Resolved target file for Open-in-editor (from rawInput / locations / diff). */
  toolFilePath?: string
  structuredContent?: unknown
}

/** Merge tool-call updates by toolCallId to avoid duplicate cards in the chat UI. */
export function mergeToolCallBubble(list: ChatBubble[], incoming: ChatBubble): ChatBubble[] {
  if (incoming.type !== 'tool-call') {
    return [...list, incoming]
  }

  let idx = incoming.toolCallId
    ? list.findIndex((m) => m.type === 'tool-call' && m.toolCallId === incoming.toolCallId)
    : -1

  if (idx === -1 && isToolCallTerminal(incoming.status)) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const candidate = list[i]
      if (candidate.type !== 'tool-call' || !isToolCallInProgress(candidate.status)) continue
      if (incoming.kind && candidate.kind && incoming.kind !== candidate.kind) continue
      idx = i
      break
    }
    if (idx === -1) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const candidate = list[i]
        if (candidate.type === 'tool-call' && isToolCallInProgress(candidate.status)) {
          idx = i
          break
        }
      }
    }
  }

  if (idx === -1) {
    return [...list, incoming]
  }

  const next = [...list]
  const existing = next[idx]
  const mergedTitle = incoming.title || existing.title
  const mergedKind = incoming.kind || existing.kind
  const mergedContent = incoming.content ?? existing.content
  const mergedRawInput = incoming.rawInput ?? existing.rawInput
  const mergedStructured = incoming.structuredContent ?? existing.structuredContent
  const preservedToolFilePath = existing.toolFilePath || incoming.toolFilePath
  const toolFilePath = preservedToolFilePath || extractToolCallFilePath({
    title: mergedTitle,
    kind: mergedKind,
    content: mergedContent,
    rawInput: mergedRawInput,
    structuredContent: mergedStructured,
    toolFilePath: undefined,
  }, { allowTextFallback: false }) || undefined
  const mergedToolCallId = incoming.toolCallId || existing.toolCallId
  next[idx] = {
    ...existing,
    toolCallId: mergedToolCallId,
    title: mergedTitle,
    status: mergeToolCallStatus(existing.status, incoming.status),
    content: mergedContent,
    rawInput: mergedRawInput,
    kind: mergedKind,
    structuredContent: mergedStructured,
    toolFilePath,
  }
  return next
}

export function extractLineNumberFromToolText(text: string): number | null {
  if (!text) return null
  const patterns = [
    /[:\(]L?(\d{1,6})\b/,
    /\bline\s+(\d{1,6})\b/i,
    /\bat\s+line\s+(\d{1,6})\b/i,
    /^(\d{1,6})→/m,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const line = Number.parseInt(match[1], 10)
      if (line > 0) return line
    }
  }
  return null
}

export interface ToolCallPathSource {
  title?: string
  kind?: string
  content?: string
  rawInput?: unknown
  locations?: Array<{ path?: string }>
  structuredContent?: unknown
  toolFilePath?: string
}

export interface ExtractToolCallFilePathOptions {
  /** When false, skip scanning free-text content (avoids wrong file on tool_call_update). */
  allowTextFallback?: boolean
}

const PATH_FIELD_KEYS = [
  'file_path',
  'filePath',
  'path',
  'file_name',
  'fileName',
  'relativePath',
  'relative_path',
] as const

const TEMPLATE_FILE_PATTERN = /master_control|daily_plan\.md|daily_note\.md|(?:^|\/)2m\.md$/i
const DAILY_PLAN_FILE_PATTERN = /\d{4}-\d{2}-\d{2}\s+PLAN\.md/i

export function parseRawInputObject(rawInput: unknown): Record<string, unknown> | null {
  if (!rawInput) return null
  if (typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return rawInput as Record<string, unknown>
  }
  if (typeof rawInput === 'string') {
    try {
      const parsed = JSON.parse(rawInput)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // not JSON — fall through to text extraction
    }
  }
  return null
}

function pickPathFromRecord(record: Record<string, unknown>): string | null {
  for (const key of PATH_FIELD_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/^["']|["']$/g, '')
    }
  }
  return null
}

export function extractPathFromStructuredContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (record.type === 'diff' && typeof record.path === 'string' && record.path.trim()) {
      return record.path.trim()
    }
  }
  return null
}

function scoreToolFilePathCandidate(path: string, kind?: string): number {
  let score = 0
  const normalized = path.replace(/\\/g, '/')

  if (DAILY_PLAN_FILE_PATTERN.test(path)) score += 120
  else if (/plan\.md$/i.test(path)) score += 90
  else if (/^\d{4}-\d{2}-\d{2}\.md$/i.test(path.split(/[/\\]/).pop() || '')) score += 70

  if (/01_日记与计划|01_Log_and_Plan/i.test(normalized)) score += 40
  if (/05_模板与配置|05_Templates/i.test(normalized)) score -= 35
  if (TEMPLATE_FILE_PATTERN.test(path)) score -= 60

  if (kind === 'edit' && /master_control/i.test(path)) score -= 100

  return score
}

function rankToolFilePathCandidates(paths: string[], kind?: string): string[] {
  return paths
    .slice()
    .sort((a, b) => scoreToolFilePathCandidate(b, kind) - scoreToolFilePathCandidate(a, kind))
}

/** Collect .md paths from free text (supports Unicode path segments and backticks). */
export function extractAllFilePathsFromToolText(text: string): string[] {
  if (!text) return []

  const found: string[] = []

  const backtickRe = /[`'"]([^`'"]+\.md)[`'"]/gi
  let match: RegExpExecArray | null
  while ((match = backtickRe.exec(text)) !== null) {
    found.push(match[1].trim())
  }

  const pathRe = /(?:[A-Za-z]:[/\\][^\s"'`|<>]+|\.\.?[/\\][^\s"'`|<>]+|(?:[^\s"'`|<>/\\]+[/\\])+[^/\\`'"]+\.md)/gi
  while ((match = pathRe.exec(text)) !== null) {
    found.push(match[0].replace(/^[`'"(\[]+|[)`'"\]]+$/g, '').trim())
  }

  const seen = new Set<string>()
  return found.filter((candidate) => {
    const key = candidate.toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractPathFromTitle(title?: string): string | null {
  if (!title?.trim()) return null
  const match = title.trim().match(/^(?:write|edit|read|patch|create|str_replace|insert)\s+(.+\.md)$/i)
  return match?.[1]?.trim() || null
}

/**
 * Resolve the file a tool call touched — AionUi buildParamSummary order:
 * locations → diff content.path → rawInput.path → title → ranked text fallback.
 */
export function extractToolCallFilePath(
  source: ToolCallPathSource,
  options?: ExtractToolCallFilePathOptions,
): string | null {
  if (source.toolFilePath?.trim()) return source.toolFilePath.trim()

  if (Array.isArray(source.locations)) {
    for (const loc of source.locations) {
      if (typeof loc?.path === 'string' && loc.path.trim()) {
        return loc.path.trim()
      }
    }
  }

  const diffPath = extractPathFromStructuredContent(source.structuredContent)
  if (diffPath) return diffPath

  const raw = parseRawInputObject(source.rawInput)
  if (raw) {
    const fromRaw = pickPathFromRecord(raw)
    if (fromRaw) return fromRaw
  }

  const fromTitle = extractPathFromTitle(source.title)
  if (fromTitle) return fromTitle

  if (options?.allowTextFallback === false) return null

  const haystack = [
    source.content || '',
    typeof source.rawInput === 'string' ? source.rawInput : '',
  ].join(' ')

  const candidates = extractAllFilePathsFromToolText(haystack)
  if (candidates.length === 0) return null

  return rankToolFilePathCandidates(candidates, source.kind)[0] || null
}

/** @deprecated Prefer extractToolCallFilePath — kept for callers that only have plain text. */
export function extractFilePathFromToolText(text: string): string | null {
  return extractToolCallFilePath({ content: text })
}
