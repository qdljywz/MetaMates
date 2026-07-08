import { describe, expect, it } from 'vitest'
import { applyStreamMessage } from '../services/message/acpStreamReducer'
import { extractToolCallFilePath, mergeToolCallBubble } from '../services/agent-bridge/mergeChatBubble'
import type { IResponseMessage } from '../../electron/shared/responseMessage'

describe('tool open file path (no text guessing)', () => {
  it('never opens Master_Control when only diff text mentions it', () => {
    const path = extractToolCallFilePath({
      kind: 'edit',
      content: [
        '46→- [ ] task',
        'see 05_模板与配置/Master_Control.md',
        'todo `01_日记与计划/2026-06-23.md`',
      ].join('\n'),
    }, { allowTextFallback: false })
    expect(path).toBeNull()
  })

  it('uses authoritative toolFilePath from fs write patch', () => {
    const first: IResponseMessage = {
      type: 'acp_tool_call',
      msg_id: 'tc-write',
      conversation_id: 'c1',
      position: 'left',
      status: 'work',
      data: {
        update: {
          toolCallId: 'tc-write',
          title: 'Write',
          kind: 'edit',
          status: 'in_progress',
        },
      },
    }
    const patch: IResponseMessage = {
      type: 'acp_tool_call',
      msg_id: 'tc-write',
      conversation_id: 'c1',
      position: 'left',
      status: 'work',
      data: {
        update: {
          toolCallId: 'tc-write',
          toolFilePath: '01_日记与计划/2026-06-23 PLAN.md',
        },
      },
    }
    const completed: IResponseMessage = {
      type: 'acp_tool_call',
      msg_id: 'tc-write',
      conversation_id: 'c1',
      position: 'left',
      status: 'finish',
      data: {
        update: {
          toolCallId: 'tc-write',
          status: 'completed',
          content: 'mentions Master_Control.md only',
        },
      },
    }

    let list = applyStreamMessage([], first).messages
    list = applyStreamMessage(list, patch).messages
    list = applyStreamMessage(list, completed).messages

    expect(list).toHaveLength(1)
    expect(list[0].toolFilePath).toBe('01_日记与计划/2026-06-23 PLAN.md')
  })

  it('mergeToolCallBubble keeps fs-write path over diff text', () => {
    const merged = mergeToolCallBubble(
      mergeToolCallBubble([], {
        id: '1',
        type: 'tool-call',
        toolCallId: 'tc-1',
        kind: 'edit',
        status: 'in_progress',
        toolFilePath: '01_日记与计划/2026-06-23 PLAN.md',
      }),
      {
        id: '1',
        type: 'tool-call',
        toolCallId: 'tc-1',
        kind: 'edit',
        status: 'completed',
        content: 'Master_Control.md and 2026-06-23.md mentioned here',
      },
    )
    expect(merged[0].toolFilePath).toBe('01_日记与计划/2026-06-23 PLAN.md')
  })
})
