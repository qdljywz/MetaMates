import { describe, expect, it } from 'vitest'
import {
  appendPomodoroLineToMarkdown,
  formatPomodoroDiaryLine,
  pomodoroSectionHeading,
} from './appendPomodoroToDailyNote'

describe('appendPomodoroToDailyNote', () => {
  it('formats a diary line with local times and note', () => {
    const started = new Date(2026, 9, 26, 14, 32, 0)
    const ended = new Date(2026, 9, 26, 14, 57, 0)
    expect(
      formatPomodoroDiaryLine({
        startedAt: started,
        endedAt: ended,
        durationMin: 25,
        note: '写完图谱焦点交互',
      }),
    ).toBe('- [x] 14:32–14:57 (25m) 写完图谱焦点交互')
  })

  it('picks zh/en section headings', () => {
    expect(pomodoroSectionHeading('zh')).toBe('## 番茄钟')
    expect(pomodoroSectionHeading('en')).toBe('## Pomodoro')
  })

  it('creates a section when missing', () => {
    const out = appendPomodoroLineToMarkdown(
      '# 2026-10-26\n\nhello',
      '- [x] 14:32–14:57 (25m) task',
      'zh',
    )
    expect(out).toContain('## 番茄钟')
    expect(out).toContain('- [x] 14:32–14:57 (25m) task')
  })

  it('appends under an existing section before the next heading', () => {
    const existing = `# Day

## 番茄钟

- [x] 09:00–09:25 (25m) a

## 其他

x
`
    const out = appendPomodoroLineToMarkdown(
      existing,
      '- [x] 10:00–10:25 (25m) b',
      'zh',
    )
    expect(out.indexOf('- [x] 09:00–09:25 (25m) a')).toBeLessThan(
      out.indexOf('- [x] 10:00–10:25 (25m) b'),
    )
    expect(out.indexOf('- [x] 10:00–10:25 (25m) b')).toBeLessThan(out.indexOf('## 其他'))
  })
})
