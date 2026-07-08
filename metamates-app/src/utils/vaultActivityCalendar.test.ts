import { describe, expect, it } from 'vitest'
import { buildVaultActivityIndex, toLocalDateString } from './vaultActivityCalendar'

describe('vaultActivityCalendar', () => {
  it('groups vault content files by local edit date', () => {
    const ws = 'E:/vault'
    const day = '2026-06-30'
    const ts = new Date(`${day}T14:30:00`).getTime()
    const { byDate, recent } = buildVaultActivityIndex(
      ws,
      [
        { name: 'idea.md', path: `${ws}/03_点滴积累/idea.md`, lastModified: ts },
        { name: '2026-06-30.md', path: `${ws}/01_日记与计划/${day}.md`, lastModified: ts - 1000 },
      ],
      'zh',
    )
    expect(byDate.get(day)?.length).toBe(2)
    expect(recent.length).toBe(2)
    expect(byDate.get(day)?.[0].relativePath).toContain('idea.md')
  })

  it('excludes agent root configs', () => {
    const ws = 'E:/vault'
    const ts = Date.now()
    const { recent } = buildVaultActivityIndex(
      ws,
      [{ name: 'GEMINI.md', path: `${ws}/GEMINI.md`, lastModified: ts }],
      'zh',
    )
    expect(recent.length).toBe(0)
  })

  it('tracks diary/plan markers only under daily dir', () => {
    const ws = 'E:/vault'
    const ts = Date.now()
    const { noteDates, planDates } = buildVaultActivityIndex(
      ws,
      [
        { name: '2026-06-30.md', path: `${ws}/01_日记与计划/2026-06-30.md`, lastModified: ts },
        { name: '2026-06-30.md', path: `${ws}/02_项目与知识/2026-06-30.md`, lastModified: ts },
        { name: '2026-06-30 PLAN.md', path: `${ws}/01_日记与计划/2026-06-30 PLAN.md`, lastModified: ts },
      ],
      'zh',
    )
    expect(noteDates.has('2026-06-30')).toBe(true)
    expect(planDates.has('2026-06-30')).toBe(true)
    expect(noteDates.size).toBe(1)
  })

  it('ignores inbox captures for diary/plan dots', () => {
    const ws = 'E:/vault'
    const ts = Date.now()
    const { noteDates, planDates } = buildVaultActivityIndex(
      ws,
      [
        { name: '2026-06-23.md', path: `${ws}/01_日记与计划/Inbox/2026-06-23.md`, lastModified: ts },
        { name: '2026-06-23 PLAN.md', path: `${ws}/01_日记与计划/Inbox/2026-06-23 PLAN.md`, lastModified: ts },
      ],
      'zh',
    )
    expect(noteDates.size).toBe(0)
    expect(planDates.size).toBe(0)
  })

  it('groups edits by mtime day not filename date', () => {
    const ws = 'E:/vault'
    const editDay = '2026-06-27'
    const ts = new Date(`${editDay}T09:44:00`).getTime()
    const { byDate } = buildVaultActivityIndex(
      ws,
      [{ name: '2026-06-25.md', path: `${ws}/01_日记与计划/2026-06-25.md`, lastModified: ts }],
      'zh',
    )
    expect(byDate.get(editDay)?.length).toBe(1)
    expect(byDate.get('2026-06-25')).toBeUndefined()
  })

  it('formats local date string', () => {
    const ts = new Date(2026, 5, 30, 23, 59).getTime()
    expect(toLocalDateString(ts)).toBe('2026-06-30')
  })
})
