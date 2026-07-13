import { describe, expect, it } from 'vitest'
import {
  extractIdeasReportPreview,
  extractIdeasReportSummary,
  inboxQuestionPriority,
  isNoiseRecentFile,
  parsePlanSignals,
  pickIdeasReportLabel,
  pickLatestIdeasReportFile,
  pickRecentFocusLabel,
} from './emptyStateContextSignals'

describe('parsePlanSignals', () => {
  it('counts open and done tasks and picks first open label', () => {
    const signals = parsePlanSignals(`# 今日 PLAN
- [x] 晨会
- [ ] **14:00 - 15:00**：对齐 MetaMates 产品化路线
- [ ] 写复盘段落
`)
    expect(signals.uncheckedCount).toBe(2)
    expect(signals.checkedCount).toBe(1)
    expect(signals.firstOpenTask).toContain('MetaMates')
    expect(signals.headline).toBe('今日 PLAN')
  })
})

describe('focus heuristics', () => {
  it('skips e2e noise in recent files', () => {
    expect(isNoiseRecentFile('_e2e_inbox_a.md')).toBe(true)
    expect(pickRecentFocusLabel([
      { path: '/a/_e2e_x.md', name: '_e2e_x.md' },
      { path: '/a/project/路线.md', name: '路线.md' },
    ])).toBe('路线')
  })

  it('picks latest ideas report by name', () => {
    expect(pickIdeasReportLabel([
      { name: 'Ideas_Report_2026-07-06.md' },
      { name: 'Ideas_Report_2026-07-07.md' },
    ])).toBe('Ideas_Report_2026-07-07')
  })

  it('picks latest ideas report file with path', () => {
    expect(pickLatestIdeasReportFile([
      { name: 'Ideas_Report_2026-07-06.md', path: '/vault/insights/Ideas_Report_2026-07-06.md' },
      { name: 'Ideas_Report_2026-07-07.md', path: '/vault/insights/Ideas_Report_2026-07-07.md' },
    ])).toEqual({
      label: 'Ideas_Report_2026-07-07',
      path: '/vault/insights/Ideas_Report_2026-07-07.md',
    })
  })

  it('extracts ideas report summary and preview from markdown', () => {
    const content = `# Ideas Report 2026-07-07

## 插件化路线
- 文档导入拆成可选插件
- 主程序体积下降，扩展从 GitHub 安装
`
    expect(extractIdeasReportSummary(content)).toBe('插件化路线')
    expect(extractIdeasReportPreview(content)).toContain('文档导入拆成可选插件')
  })

  it('skips emoji section headings and surfaces bullet ideas', () => {
    const content = `# Ideas Report 2026-07-07

## 💡 点子报告 2026-07-07
## 💡 点子报告
- 文档导入拆成可选插件
- 主程序体积下降，扩展从 GitHub 安装
`
    expect(extractIdeasReportSummary(content)).toBe('文档导入拆成可选插件')
    const preview = extractIdeasReportPreview(content)
    expect(preview).toContain('文档导入拆成可选插件')
    expect(preview).toContain('主程序体积下降')
    expect(preview).not.toContain('点子报告 2026-07-07')
  })

  it('lowers inbox priority when backlog is large', () => {
    expect(inboxQuestionPriority(3)).toBeGreaterThan(inboxQuestionPriority(20))
  })
})
