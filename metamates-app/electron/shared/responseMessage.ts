/**
 * Unified ACP stream message contract (aligned with AionUi IResponseMessage).
 * Main process emits these; renderer consumes via acp-stream-message IPC.
 */

export type StreamMessagePosition = 'left' | 'right' | 'center' | 'pop'
export type StreamMessageStatus = 'finish' | 'pending' | 'error' | 'work'

export type StreamMessageType =
  | 'start'
  | 'finish'
  | 'error'
  | 'text'
  | 'content'
  | 'user_content'
  | 'acp_tool_call'
  | 'plan'
  | 'thinking'
  | 'available_commands'
  | 'tips'

export interface IResponseMessage {
  type: StreamMessageType
  data: unknown
  msg_id: string
  turn_id?: string
  conversation_id: string
  created_at?: number
  hidden?: boolean
  position?: StreamMessagePosition
  status?: StreamMessageStatus
  replace?: boolean
}

export interface StreamMessageEnvelope {
  backend: string
  message: IResponseMessage
}
