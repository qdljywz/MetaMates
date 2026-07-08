import { describe, expect, it } from 'vitest'
import { applyStreamMessage } from '../services/message/acpStreamReducer'
import type { IResponseMessage } from '../../electron/shared/responseMessage'

describe('acpStreamReducer', () => {
  it('merges streaming agent text by msg_id', () => {
    const msg1: IResponseMessage = {
      type: 'text',
      msg_id: 'm1',
      conversation_id: 'c1',
      position: 'left',
      status: 'work',
      data: { content: 'Hello' },
    }
    const msg2: IResponseMessage = {
      type: 'text',
      msg_id: 'm1',
      conversation_id: 'c1',
      position: 'left',
      status: 'work',
      data: { content: ' world' },
    }
    const first = applyStreamMessage([], msg1)
    const second = applyStreamMessage(first.messages, msg2)
    expect(second.messages).toHaveLength(1)
    expect(second.messages[0].content).toBe('Hello world')
  })

  it('clears streaming status on finish', () => {
    const streaming = applyStreamMessage([], {
      type: 'text',
      msg_id: 'm1',
      conversation_id: 'c1',
      position: 'left',
      status: 'work',
      data: { content: 'Done' },
    })
    const finished = applyStreamMessage(streaming.messages, {
      type: 'finish',
      msg_id: 'turn-1',
      conversation_id: 'c1',
      data: {},
    })
    expect(finished.messages[0].status).toBe('finish')
  })

  it('preserves PLAN path when tool_call_update only adds diff text', () => {
    const first: IResponseMessage = {
      type: 'acp_tool_call',
      msg_id: 'tc-1',
      conversation_id: 'c1',
      position: 'left',
      status: 'work',
      data: {
        update: {
          toolCallId: 'tc-1',
          title: 'Write',
          kind: 'edit',
          status: 'in_progress',
          rawInput: { path: '01_日记与计划/2026-06-23 PLAN.md' },
          toolFilePath: '01_日记与计划/2026-06-23 PLAN.md',
        },
      },
    }
    const second: IResponseMessage = {
      type: 'acp_tool_call',
      msg_id: 'tc-1',
      conversation_id: 'c1',
      position: 'left',
      status: 'finish',
      data: {
        update: {
          toolCallId: 'tc-1',
          status: 'completed',
          content: 'mentions 05_模板与配置/Master_Control.md and 01_日记与计划/2026-06-23.md',
        },
      },
    }
    const afterFirst = applyStreamMessage([], first)
    const afterSecond = applyStreamMessage(afterFirst.messages, second)
    expect(afterSecond.messages).toHaveLength(1)
    expect(afterSecond.messages[0].toolFilePath).toBe('01_日记与计划/2026-06-23 PLAN.md')
  })
})
