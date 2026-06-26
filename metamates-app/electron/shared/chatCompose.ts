export interface ComposeChatMessage {
  id: string
  type: string
  msg_id?: string
  position?: string
  status?: string
  content?: unknown
}

export type ComposeToolCallIdGetter = (msg: ComposeChatMessage) => string | undefined

const defaultToolCallIdGetter: ComposeToolCallIdGetter = (msg) => {
  if (msg.type !== 'acp_tool_call') return undefined
  const content = msg.content as { update?: { toolCallId?: string } } | undefined
  return content?.update?.toolCallId
}

/** Shared message merge logic for persistence (sessionDb) and UI bubbles. */
export function composeChatMessages<T extends ComposeChatMessage>(
  existingMessages: T[] | null | undefined,
  newMessage: T,
  getToolCallId: ComposeToolCallIdGetter = defaultToolCallIdGetter
): T[] {
  if (!newMessage) return existingMessages ? [...existingMessages] : []
  if (!existingMessages || existingMessages.length === 0) {
    return [newMessage]
  }

  const messages = [...existingMessages]
  const last = messages[messages.length - 1]

  const updateAt = (index: number, message: T): T[] => {
    message.id = messages[index].id
    messages[index] = message
    return messages
  }

  const push = (message: T): T[] => {
    messages.push(message)
    return messages
  }

  if (newMessage.type === 'acp_tool_call') {
    const toolCallId = getToolCallId(newMessage)
    if (toolCallId) {
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].type === 'acp_tool_call' && getToolCallId(messages[i]) === toolCallId) {
          const prevContent = messages[i].content as { update?: Record<string, unknown> } | undefined
          const nextContent = newMessage.content as { update?: Record<string, unknown> } | undefined
          const mergedContent = {
            ...prevContent,
            ...nextContent,
            update: {
              ...(prevContent?.update || {}),
              ...(nextContent?.update || {}),
            },
          }
          return updateAt(i, { ...messages[i], ...newMessage, content: mergedContent })
        }
      }
    }
    return push(newMessage)
  }

  if (newMessage.type === 'plan') {
    const newSessionId = (newMessage.content as { sessionId?: string } | undefined)?.sessionId
    if (newSessionId) {
      for (let i = 0; i < messages.length; i++) {
        const sessionId = (messages[i].content as { sessionId?: string } | undefined)?.sessionId
        if (messages[i].type === 'plan' && sessionId === newSessionId) {
          const mergedContent = {
            ...(messages[i].content as object),
            ...(newMessage.content as object),
          }
          return updateAt(i, { ...messages[i], ...newMessage, content: mergedContent })
        }
      }
    }
    return push(newMessage)
  }

  if (last.msg_id !== newMessage.msg_id || last.type !== newMessage.type) {
    return push(newMessage)
  }

  if (newMessage.type === 'text' && last.type === 'text') {
    const lastContent = last.content as { content?: string } | undefined
    const newContent = newMessage.content as { content?: string } | undefined
    return updateAt(messages.length - 1, {
      ...last,
      ...newMessage,
      content: {
        ...(typeof last.content === 'object' && last.content ? last.content : {}),
        ...(typeof newMessage.content === 'object' && newMessage.content ? newMessage.content : {}),
        content: (lastContent?.content || '') + (newContent?.content || ''),
      },
    })
  }

  return updateAt(messages.length - 1, { ...last, ...newMessage })
}
