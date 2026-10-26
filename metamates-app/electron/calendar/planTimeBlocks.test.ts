import { describe, expect, it } from 'vitest'
import { parsePlanTimeBlocks, stripPlanBlockSummary } from './planTimeBlocks'

describe('parsePlanTimeBlocks', () => {
  it('parses zh template time-block section', () => {
    const md = `# 📅 每日计划：2026-10-26

## 🔴 P0 绝对优先
- [ ] 任务 A

## 🕒 时间块划分
- [ ] **09:00 - 11:00**：深度工作
- [x] **13:30 - 15:30**：代码评审
- [ ] **21:00 - 22:00**：每日复盘

## 其他
- [ ] 不是时间块
`
    const blocks = parsePlanTimeBlocks(md)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({
      time: '09:00–11:00',
      summary: '深度工作',
      done: false,
      startMinutes: 9 * 60,
    })
    expect(blocks[1].done).toBe(true)
    expect(blocks[1].summary).toBe('代码评审')
    expect(blocks[2].time).toBe('21:00–22:00')
  })

  it('parses inits Daily_Plan style with bold tags in summary', () => {
    const md = `## 🕒 时间块划分 (Time Blocking)
- [ ] **07:00 - 09:30**: **[主敬]** 深度攻坚战：[核心任务 A]
- [ ] **10:00 - 11:30**: **[外事]** 业务协作
`
    const blocks = parsePlanTimeBlocks(md)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].time).toBe('07:00–09:30')
    expect(blocks[0].summary).toContain('主敬')
    expect(blocks[0].summary).toContain('深度攻坚战')
  })

  it('parses en Time Blocks heading', () => {
    const md = `## 🕒 Time Blocks
- [ ] **09:00 - 11:00**: Deep work
`
    expect(parsePlanTimeBlocks(md)).toEqual([
      expect.objectContaining({ time: '09:00–11:00', summary: 'Deep work' }),
    ])
  })

  it('ignores checkbox lines outside time-block section when heading exists', () => {
    const md = `## P0
- [ ] **09:00 - 10:00**：假阳性

## 🕒 时间块划分
- [ ] **14:00 - 15:00**：真块
`
    const blocks = parsePlanTimeBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].summary).toBe('真块')
  })

  it('falls back to whole doc when no time-block heading', () => {
    const md = `- [ ] **08:00 - 09:00**：早会
- [ ] 普通任务
`
    expect(parsePlanTimeBlocks(md)).toHaveLength(1)
  })

  it('parses loose non-bold time lines', () => {
    const md = `## Time Blocking
- [ ] 09:00 - 10:30：站会
`
    expect(parsePlanTimeBlocks(md)[0]).toMatchObject({
      time: '09:00–10:30',
      summary: '站会',
    })
  })

  it('parses MyM2 时间安排 plain dashes (no checkbox)', () => {
    const md = `# 2026-10-26 PLAN

⏰ 时间安排

**上午**
- 09:00–12:00 — 📚 **nanoGPT学习**——3小时专心学习

**下午**
- 14:00 — 🎤 **代理商培训**——用户讲20分钟
- 14:30–15:30 — 🔴 **上海颠覆中心上会跟进**

📋 待办事项
- [ ] 普通待办不应计入
`
    const blocks = parsePlanTimeBlocks(md)
    expect(blocks.map((b) => b.time)).toEqual(['09:00–12:00', '14:00', '14:30–15:30'])
    expect(blocks[0].summary).toContain('nanoGPT')
    expect(blocks[1].summary).toContain('代理商培训')
  })
})

describe('stripPlanBlockSummary', () => {
  it('unwraps bold markers', () => {
    expect(stripPlanBlockSummary('**[主敬]** 深度')).toBe('[主敬] 深度')
  })
})
