/**
 * Apply unified IResponseMessage stream events to UI message list (AionUi-style).
 */

import type { IResponseMessage } from '../../../electron/shared/responseMessage'
import { composeChatBubble, normalizeHistoryBubble, type ChatBubble } from '../agent-bridge/composeChatBubble'

export type AgentMessage = ChatBubble & {
  created_at?: number
  attachments?: Array<{ path: string; name: string }>
}

export interface StreamSideEffects {
  availableCommands?: Array<{ name: string; description?: string }>
}

function streamMessageToDbRow(msg: IResponseMessage): Record<string, unknown> {
  switch (msg.type) {
    case 'text':
    case 'content':
      return {
        id: msg.msg_id,
        type: 'text',
        msg_id: msg.msg_id,
        position: msg.position || 'left',
        status: msg.status === 'work' ? 'streaming' : 'finish',
        content: msg.data,
      }
    case 'user_content':
      return {
        id: msg.msg_id,
        type: 'text',
        position: 'right',
        status: 'finish',
        content: msg.data,
      }
    case 'acp_tool_call':
      return {
        id: msg.msg_id,
        type: 'acp_tool_call',
        msg_id: msg.msg_id,
        content: msg.data,
        position: 'left',
        status: msg.status === 'work' ? 'streaming' : 'finish',
      }
    case 'plan':
      return {
        id: msg.msg_id,
        type: 'plan',
        content: msg.data,
        position: 'left',
      }
    default:
      return { id: msg.msg_id, type: msg.type, content: msg.data }
  }
}

export function applyStreamMessage(
  list: AgentMessage[],
  message: IResponseMessage,
): { messages: AgentMessage[]; sideEffects: StreamSideEffects } {
  const sideEffects: StreamSideEffects = {}

  if (message.type === 'available_commands') {
    const data = message.data as { commands?: Array<{ name: string; description?: string }> }
    if (Array.isArray(data?.commands)) {
      sideEffects.availableCommands = data.commands
    }
    return { messages: list, sideEffects }
  }

  if (message.type === 'start' || message.type === 'finish' || message.type === 'error') {
    if (message.type === 'finish' || message.type === 'error') {
      const next = [...list]
      if (next.length > 0) {
        const last = next[next.length - 1]
        if (last.type === 'agent' && last.status === 'streaming') {
          next[next.length - 1] = { ...last, status: 'finish' }
        }
      }
      return { messages: next, sideEffects }
    }
    return { messages: list, sideEffects }
  }

  const bubble = normalizeHistoryBubble(streamMessageToDbRow(message)) as AgentMessage
  if (message.created_at != null) {
    bubble.created_at = message.created_at
  }
  if (bubble.type === 'agent' && message.status === 'work') {
    bubble.status = 'streaming'
    bubble.msg_id = message.msg_id
  }

  if (bubble.type === 'user') {
    const last = list[list.length - 1]
    if (last?.type === 'user' && (last.content || '').trim() === (bubble.content || '').trim()) {
      return { messages: list, sideEffects }
    }
  }

  if (bubble.type === 'agent' && !bubble.content?.trim()) {
    return { messages: list, sideEffects }
  }

  const merged = composeChatBubble(list, bubble) as AgentMessage[]
  return { messages: merged, sideEffects }
}

export function isTurnControlMessage(type: IResponseMessage['type']): boolean {
  return type === 'start' || type === 'finish' || type === 'error'
}

export function isStreamingTurnActive(type: IResponseMessage['type']): boolean {
  return type === 'start'
}

export function isTurnTerminalMessage(type: IResponseMessage['type']): boolean {
  return type === 'finish' || type === 'error'
}
