import { composeChatMessages, type ComposeChatMessage } from '../../../electron/shared/chatCompose'
import { shouldHideAgentRethinkLeak } from '../../../electron/shared/emptyStateRethinkLeak'
import { sanitizeAgentDisplayText, unescapeLiteralEscapes } from '../../../electron/shared/textNormalize'
import { extractFilePathFromToolText, extractLineNumberFromToolText, extractToolCallFilePath, extractPathFromStructuredContent, mergeToolCallBubble } from './mergeChatBubble'

export interface ChatBubble extends ComposeChatMessage {
  content?: string
  toolCallId?: string
  title?: string
  kind?: string
  rawInput?: string
  toolFilePath?: string
  structuredContent?: unknown
  attachments?: Array<{ path: string; name: string }>
}

export type ToolCallKind = 'read' | 'edit' | 'execute' | 'search' | 'unknown'

const TOOL_KIND_PATTERN = /\b(read|edit|write|execute|search|grep|list)\b/i

export { sanitizeAgentDisplayText, unescapeLiteralEscapes }

export function inferToolCallKind(title?: string, kind?: string): ToolCallKind {
  const normalizedKind = kind?.toLowerCase()
  if (normalizedKind === 'read') return 'read'
  if (normalizedKind === 'edit') return 'edit'
  if (normalizedKind === 'execute') return 'execute'
  if (normalizedKind === 'search') return 'search'

  const haystack = (title || '').toLowerCase()
  if (/\b(read|cat|open)\b/.test(haystack)) return 'read'
  if (/\b(edit|write|patch|replace)\b/.test(haystack)) return 'edit'
  if (/\b(run|exec|shell|command|bash)\b/.test(haystack)) return 'execute'
  if (/\b(search|grep|find)\b/.test(haystack)) return 'search'
  if (TOOL_KIND_PATTERN.test(haystack)) return 'search'
  return 'unknown'
}

export function normalizeHistoryBubble(raw: Record<string, unknown>): ChatBubble {
  if (raw.type === 'acp_tool_call') {
    const update = (raw.content as { update?: Record<string, unknown> } | undefined)?.update || {}
    const title = String(update.title || 'Tool')
    const contentText = update.content ? extractToolContentText(update.content) : ''
    const kind = String(update.kind || inferToolCallKind(title))
    const rawInput = update.rawInput ?? update.raw_input
    const structuredContent = update.content
    const persistedPath = typeof update.toolFilePath === 'string' ? update.toolFilePath : undefined
    const toolFilePath = persistedPath || extractToolCallFilePath({
      title,
      kind,
      content: contentText,
      rawInput,
      locations: update.locations as Array<{ path?: string }> | undefined,
      structuredContent,
    }, { allowTextFallback: false }) || undefined
    return {
      id: String(raw.id),
      type: 'tool-call',
      toolCallId: String(update.toolCallId || update.tool_call_id || raw.id),
      title,
      kind,
      status: String(update.status || 'completed'),
      content: contentText,
      rawInput: stringifyRawInput(rawInput),
      structuredContent,
      toolFilePath,
      position: 'left',
    }
  }

  if (raw.type === 'tips' || raw.type === 'thinking') {
    const content = raw.content as { content?: string } | string | undefined
    return {
      id: String(raw.id),
      type: 'thinking',
      content: typeof content === 'string' ? content : (content?.content || ''),
      position: 'center',
      status: String(raw.status || 'finish'),
    }
  }

  if (raw.type === 'plan') {
    const planContent = (raw.content as { entries?: unknown[]; content?: unknown } | undefined)
    const entries = planContent?.entries || planContent?.content || raw.content
    const lines = Array.isArray(entries)
      ? entries.map((entry, index) => {
          const item = entry as Record<string, unknown>
          return `${index + 1}. ${item.description || item.title || item.content || JSON.stringify(item)}`
        }).join('\n')
      : (typeof entries === 'string' ? entries : JSON.stringify(entries, null, 2))
    return {
      id: String(raw.id),
      type: 'plan',
      title: String((raw.content as { title?: string } | undefined)?.title || 'Plan'),
      content: lines,
      position: 'left',
    }
  }

  if (raw.position === 'right' || raw.type === 'user_message') {
    return {
      id: String(raw.id),
      type: 'user',
      content: extractBubbleText(raw.content),
      attachments: extractBubbleAttachments(raw.content),
      position: 'right',
      status: String(raw.status || 'finish'),
    }
  }

  const body = extractBubbleText(raw.content)
  const agentContent = raw.status === 'streaming'
    ? body
    : sanitizeAgentDisplayText(body)
  if (raw.position !== 'right' && shouldHideAgentRethinkLeak(agentContent || body)) {
    return {
      id: String(raw.id),
      type: 'agent',
      content: '',
      position: 'left',
      status: String(raw.status || 'finish'),
    }
  }
  return {
    id: String(raw.id),
    type: 'agent',
    content: agentContent,
    position: 'left',
    status: String(raw.status || 'finish'),
  }
}

export function composeChatBubble(list: ChatBubble[], incoming: ChatBubble): ChatBubble[] {
  if (incoming.type === 'tool-call' && incoming.toolCallId) {
    return mergeToolCallBubble(list, incoming) as ChatBubble[]
  }

  if (incoming.type === 'agent' && incoming.status === 'streaming') {
    const last = list[list.length - 1]
    if (last?.type === 'agent' && last.status === 'streaming' && last.msg_id === incoming.msg_id) {
      const combined = (last.content || '') + (incoming.content || '')
      if (shouldHideAgentRethinkLeak(combined)) {
        const next = [...list]
        next[next.length - 1] = { ...last, content: '', status: 'finish' }
        return next
      }
      const next = [...list]
      next[next.length - 1] = {
        ...last,
        content: combined,
      }
      return next
    }
  }

  if (incoming.type === 'thinking' && incoming.status === 'streaming') {
    const last = list[list.length - 1]
    if (last?.type === 'thinking' && last.status === 'streaming') {
      const next = [...list]
      next[next.length - 1] = {
        ...last,
        content: (last.content || '') + (incoming.content || ''),
      }
      return next
    }
  }

  if (incoming.type === 'user') {
    return [...list, { ...incoming, position: 'right' }]
  }

  return [...list, incoming]
}

function extractBubbleText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    const record = content as { display?: unknown; content?: unknown; text?: unknown }
    if (typeof record.display === 'string' && record.display.trim()) return record.display
    if (typeof record.text === 'string') return record.text
    if ('content' in record) {
      const nested = record.content
      if (typeof nested === 'string') return nested
      if (nested && typeof nested === 'object') {
        const nestedRecord = nested as { text?: unknown; content?: unknown }
        if (typeof nestedRecord.text === 'string') return nestedRecord.text
        if (typeof nestedRecord.content === 'string') return nestedRecord.content
      }
      return ''
    }
  }
  return ''
}

function extractBubbleAttachments(content: unknown): ChatBubble['attachments'] {
  if (!content || typeof content !== 'object' || !('attachments' in content)) return undefined
  const attachments = (content as { attachments?: unknown }).attachments
  if (!Array.isArray(attachments)) return undefined
  return attachments
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as { path?: unknown; name?: unknown }
      if (typeof record.path !== 'string' || typeof record.name !== 'string') return null
      return { path: record.path, name: record.name }
    })
    .filter((item): item is { path: string; name: string } => item !== null)
}

function extractToolContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((item) => extractToolContentText(item)).filter(Boolean).join('\n\n')
  }
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>
    if (record.type === 'content' && record.content && typeof record.content === 'object') {
      const nested = record.content as { text?: string }
      if (nested.text) return nested.text
    }
    if (typeof record.text === 'string') return record.text
    if (typeof record.path === 'string') return record.path
  }
  return ''
}

function stringifyRawInput(rawInput: unknown): string | undefined {
  if (!rawInput) return undefined
  if (typeof rawInput === 'string') return rawInput
  try {
    return JSON.stringify(rawInput, null, 2)
  } catch {
    return String(rawInput)
  }
}

export { extractFilePathFromToolText, extractLineNumberFromToolText, extractToolCallFilePath, extractPathFromStructuredContent }
