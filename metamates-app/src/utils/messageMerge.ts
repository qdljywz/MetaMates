/** Merge DB history with in-flight streaming messages (AionUi preferTextMessageVersion pattern). */

export interface MergeableTextMessage {
  id?: string
  msg_id?: string
  type?: string
  content?: { content?: string; display?: string; [key: string]: unknown } | string
  created_at?: number
}

function textLength(msg: MergeableTextMessage): number {
  if (msg.type !== 'text') return 0
  const c = msg.content
  if (typeof c === 'string') return c.length
  const body = typeof c?.content === 'string' ? c.content : ''
  const display = typeof c?.display === 'string' ? c.display : ''
  return Math.max(body.length, display.length)
}

export function preferTextMessageVersion<T extends MergeableTextMessage>(
  dbMsg: T,
  streamMsg: T,
): T {
  if (dbMsg.type !== 'text' || streamMsg.type !== 'text') return dbMsg
  return textLength(streamMsg) >= textLength(dbMsg) ? streamMsg : dbMsg
}

export function mergeHistoryWithStreaming<T extends MergeableTextMessage>(
  history: T[],
  existing: T[],
): T[] {
  if (!existing.length) return history
  const sameBackend = existing
  if (!sameBackend.length) return history

  const dbIds = new Set(history.map((m) => m.id).filter(Boolean))
  const dbMsgIds = new Set(history.map((m) => m.msg_id).filter(Boolean))

  const streamingByMsgId = new Map<string, T>()
  for (const m of sameBackend) {
    if (m.msg_id && m.type === 'text' && dbMsgIds.has(m.msg_id)) {
      streamingByMsgId.set(m.msg_id, m)
    }
  }

  const mergedHistory = history.map((dbMsg) => {
    if (!dbMsg.msg_id || dbMsg.type !== 'text') return dbMsg
    const streamMsg = streamingByMsgId.get(dbMsg.msg_id)
    if (!streamMsg) return dbMsg
    return preferTextMessageVersion(dbMsg, streamMsg)
  })

  const streamingOnly = sameBackend.filter(
    (m) => !m.id || (!dbIds.has(m.id) && !(m.msg_id && dbMsgIds.has(m.msg_id))),
  )

  if (!streamingOnly.length && !streamingByMsgId.size) return history
  return [...mergedHistory, ...streamingOnly]
}
