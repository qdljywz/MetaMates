import { describe, expect, it } from 'vitest'
import {
  extractAllFilePathsFromToolText,
  extractToolCallFilePath,
} from '../services/agent-bridge/mergeChatBubble'

describe('extractToolCallFilePath', () => {
  it('prefers rawInput.path over Master_Control mention in content', () => {
    const path = extractToolCallFilePath({
      kind: 'edit',
      rawInput: {
        path: '01_日记与计划/2026-06-23 PLAN.md',
      },
      content: [
        '32→- [ ] 更新今日日记 `01_日记与计划/2026-06-23.md`',
        'see 05_模板与配置/Master_Control.md for template',
      ].join('\n'),
    })
    expect(path).toBe('01_日记与计划/2026-06-23 PLAN.md')
  })

  it('uses ACP diff content path when present', () => {
    const path = extractToolCallFilePath({
      kind: 'edit',
      structuredContent: [
        { type: 'diff', path: '01_日记与计划/2026-06-23 PLAN.md', old_text: 'a', new_text: 'b' },
      ],
      content: 'mentions Master_Control.md only',
    })
    expect(path).toBe('01_日记与计划/2026-06-23 PLAN.md')
  })

  it('ranks PLAN over diary and template when parsing text only', () => {
    const path = extractToolCallFilePath({
      kind: 'edit',
      content: [
        'updated 05_模板与配置/Master_Control.md reference',
        'todo `01_日记与计划/2026-06-23.md`',
        'wrote 01_日记与计划/2026-06-23 PLAN.md',
      ].join('\n'),
    })
    expect(path).toBe('01_日记与计划/2026-06-23 PLAN.md')
  })

  it('extracts Unicode paths from backticks', () => {
    const paths = extractAllFilePathsFromToolText(
      '- [ ] 更新今日日记 `01_日记与计划/2026-06-23.md`',
    )
    expect(paths).toContain('01_日记与计划/2026-06-23.md')
  })
})
