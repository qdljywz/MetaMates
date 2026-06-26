/**
 * Single conversion layer: raw ACP session/update → IResponseMessage stream + DB writes.
 * Replaces duplicated parsing in AcpConnection + AgentChatPanel.
 */

import { sanitizeAcpToolUpdate, resolveToolCallId, type ToolCallUpdatePayload } from './acpToolCallOutput'
import type { IResponseMessage } from './responseMessage'
import { extractAcpTextChunk, extractEchoedUserText } from './textNormalize'

/** Resolve target file from structured ACP tool update (never scans free text). */
export function resolveToolFilePathFromUpdate(update: ToolCallUpdatePayload): string | undefined {
  const rawInput = update.rawInput ?? update.raw_input
  const locations = (update as Record<string, unknown>).locations as Array<{ path?: string }> | undefined
  const candidates: string[] = []

  if (Array.isArray(locations)) {
    for (const loc of locations) {
      if (typeof loc?.path === 'string' && loc.path.trim()) candidates.push(loc.path.trim())
    }
  }

  if (Array.isArray(update.content)) {
    for (const item of update.content) {
      if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'diff') {
        const p = (item as Record<string, unknown>).path
        if (typeof p === 'string' && p.trim()) candidates.push(p.trim())
      }
    }
  }

  const raw = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
    ? rawInput as Record<string, unknown>
    : null
  if (raw) {
    for (const key of ['file_path', 'filePath', 'path', 'file_name', 'fileName', 'relativePath', 'relative_path']) {
      const v = raw[key]
      if (typeof v === 'string' && v.trim()) candidates.push(v.trim())
    }
  }

  if (typeof update.title === 'string') {
    const titleMatch = update.title.match(/^(?:write|edit|read|patch|create|str_replace|insert)\s+(.+\.md)$/i)
    if (titleMatch?.[1]) candidates.push(titleMatch[1].trim())
  }

  const plan = candidates.find((p) => /\d{4}-\d{2}-\d{2}\s+PLAN\.md/i.test(p))
  if (plan) return plan
  return candidates[0]
}

export interface SessionPipelineContext {
  backend: string
  conversationId: string
  turnId: string
  /** Stable agent text msg_id for this turn — shared between DB and stream. */
  agentMsgId: string | null
  assignAgentMsgId: () => string
  clearAgentMsgId: () => void
}

export interface DbWriteOp {
  kind: 'accumulate_text' | 'insert_tool' | 'update_tool' | 'insert_plan'
  payload: Record<string, unknown>
}

export interface PipelineResult {
  stream: IResponseMessage[]
  db: DbWriteOp[]
}

function baseMessage(
  ctx: SessionPipelineContext,
  partial: Omit<IResponseMessage, 'conversation_id' | 'created_at'> & { created_at?: number },
): IResponseMessage {
  return {
    conversation_id: ctx.conversationId,
    created_at: partial.created_at ?? Date.now(),
    ...partial,
  }
}

export function buildTurnStartMessage(ctx: SessionPipelineContext): IResponseMessage {
  return baseMessage(ctx, {
    type: 'start',
    msg_id: ctx.turnId,
    turn_id: ctx.turnId,
    data: { backend: ctx.backend },
  })
}

export function buildTurnFinishMessage(ctx: SessionPipelineContext): IResponseMessage {
  return baseMessage(ctx, {
    type: 'finish',
    msg_id: ctx.turnId,
    turn_id: ctx.turnId,
    data: { backend: ctx.backend },
  })
}

export function buildTurnErrorMessage(ctx: SessionPipelineContext, error: string): IResponseMessage {
  return baseMessage(ctx, {
    type: 'error',
    msg_id: ctx.turnId,
    turn_id: ctx.turnId,
    data: { message: error },
    status: 'error',
  })
}

export function processSessionUpdate(
  update: Record<string, unknown>,
  ctx: SessionPipelineContext,
): PipelineResult {
  const stream: IResponseMessage[] = []
  const db: DbWriteOp[] = []
  const sessionUpdate = update.sessionUpdate as string | undefined

  switch (sessionUpdate) {
    case 'agent_message_chunk': {
      const text = extractAcpTextChunk(update.content)
      if (!text) break
      let msgId = ctx.agentMsgId
      if (!msgId) {
        msgId = ctx.assignAgentMsgId()
      }
      stream.push(baseMessage(ctx, {
        type: 'text',
        msg_id: msgId,
        turn_id: ctx.turnId,
        position: 'left',
        status: 'work',
        data: { content: text },
      }))
      db.push({
        kind: 'accumulate_text',
        payload: { msg_id: msgId, content: text },
      })
      break
    }

    case 'agent_thought_chunk':
      break

    case 'user_message': {
      ctx.clearAgentMsgId()
      const echoed = extractEchoedUserText(update.content)
      if (!echoed) break
      stream.push(baseMessage(ctx, {
        type: 'user_content',
        msg_id: `user-${Date.now()}`,
        turn_id: ctx.turnId,
        position: 'right',
        status: 'finish',
        data: { content: echoed.length > 500 ? echoed.slice(0, 500) : echoed },
      }))
      break
    }

    case 'tool_call': {
      ctx.clearAgentMsgId()
      const toolCallId = resolveToolCallId(update)
      const toolUpdate = sanitizeAcpToolUpdate(update as ToolCallUpdatePayload)
      const toolFilePath = resolveToolFilePathFromUpdate(toolUpdate)
      if (toolFilePath) {
        (toolUpdate as Record<string, unknown>).toolFilePath = toolFilePath
      }
      stream.push(baseMessage(ctx, {
        type: 'acp_tool_call',
        msg_id: toolCallId || ctx.assignAgentMsgId(),
        turn_id: ctx.turnId,
        position: 'left',
        status: 'work',
        data: { update: toolUpdate },
      }))
      db.push({
        kind: 'insert_tool',
        payload: {
          toolCallId: toolCallId || toolUpdate.toolCallId,
          title: toolUpdate.title,
          kind: toolUpdate.kind,
          status: toolUpdate.status || 'in_progress',
          rawInput: toolUpdate.rawInput ?? toolUpdate.raw_input,
          locations: (toolUpdate as Record<string, unknown>).locations,
          content: toolUpdate.content,
          toolFilePath,
        },
      })
      break
    }

    case 'tool_call_update': {
      const toolCallId = resolveToolCallId(update)
      const toolUpdate = sanitizeAcpToolUpdate(update as ToolCallUpdatePayload)
      const toolFilePath = resolveToolFilePathFromUpdate(toolUpdate)
      if (toolFilePath) {
        (toolUpdate as Record<string, unknown>).toolFilePath = toolFilePath
      }
      stream.push(baseMessage(ctx, {
        type: 'acp_tool_call',
        msg_id: toolCallId,
        turn_id: ctx.turnId,
        position: 'left',
        status: toolUpdate.status === 'completed' ? 'finish' : 'work',
        data: { update: toolUpdate },
      }))
      db.push({
        kind: 'update_tool',
        payload: {
          toolCallId,
          status: toolUpdate.status,
          title: toolUpdate.title,
          kind: toolUpdate.kind,
          content: toolUpdate.content,
          rawInput: toolUpdate.rawInput ?? toolUpdate.raw_input,
          locations: (toolUpdate as Record<string, unknown>).locations,
          toolFilePath,
        },
      })
      break
    }

    case 'plan': {
      ctx.clearAgentMsgId()
      const entries = (update.entries || update.plan || update) as unknown
      stream.push(baseMessage(ctx, {
        type: 'plan',
        msg_id: ctx.assignAgentMsgId(),
        turn_id: ctx.turnId,
        position: 'left',
        status: 'work',
        data: {
          sessionId: update.sessionId,
          entries: Array.isArray(entries) ? entries : [],
          title: update.title,
        },
      }))
      db.push({
        kind: 'insert_plan',
        payload: {
          sessionId: update.sessionId,
          entries: Array.isArray(entries) ? entries : [],
        },
      })
      break
    }

    case 'available_commands': {
      if (Array.isArray(update.commands)) {
        stream.push(baseMessage(ctx, {
          type: 'available_commands',
          msg_id: `cmds-${Date.now()}`,
          turn_id: ctx.turnId,
          data: { commands: update.commands },
        }))
      }
      break
    }

    default:
      break
  }

  return { stream, db }
}
