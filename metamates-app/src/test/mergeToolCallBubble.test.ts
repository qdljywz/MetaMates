import { describe, expect, it } from 'vitest'
import { mergeToolCallBubble } from '../services/agent-bridge/mergeChatBubble'

describe('mergeToolCallBubble', () => {
  it('keeps PLAN path from first tool_call when update content mentions Master_Control', () => {
    const list = mergeToolCallBubble([], {
      id: '1',
      type: 'tool-call',
      toolCallId: 'tc-1',
      title: 'Write',
      kind: 'edit',
      status: 'in_progress',
      rawInput: { path: '01_日记与计划/2026-06-23 PLAN.md' },
      toolFilePath: '01_日记与计划/2026-06-23 PLAN.md',
    })

    const merged = mergeToolCallBubble(list, {
      id: '1',
      type: 'tool-call',
      toolCallId: 'tc-1',
      title: 'Write',
      kind: 'edit',
      status: 'completed',
      content: [
        '46→- [ ] 整理黄主任汇报',
        'see 05_模板与配置/Master_Control.md',
        'todo `01_日记与计划/2026-06-23.md`',
      ].join('\n'),
    })

    expect(merged).toHaveLength(1)
    expect(merged[0].toolFilePath).toBe('01_日记与计划/2026-06-23 PLAN.md')
    expect(merged[0].rawInput).toEqual({ path: '01_日记与计划/2026-06-23 PLAN.md' })
  })
})
