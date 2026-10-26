import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { getCalendarSummary, resolveDailyPlanFilePath } from './index'

const dirs: string[] = []

function makeVault(planBody: string, dateStr = '2026-10-26'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-cal-'))
  dirs.push(root)
  const planDir = path.join(root, '01_日记与计划')
  fs.mkdirSync(planDir, { recursive: true })
  fs.writeFileSync(path.join(planDir, `${dateStr} PLAN.md`), planBody, 'utf-8')
  return root
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

describe('getCalendarSummary PLAN fallback', () => {
  it('resolves today PLAN path under zh layout', () => {
    const root = makeVault('## 🕒 时间块划分\n- [ ] **09:00 - 10:00**：A\n')
    const p = resolveDailyPlanFilePath(root, '2026-10-26')
    expect(p).toContain('2026-10-26 PLAN.md')
  })

  it('returns PLAN time blocks when no ics', () => {
    const root = makeVault(`# plan
## 🕒 时间块划分
- [ ] **09:00 - 11:00**：深度工作
- [ ] **14:00 - 15:00**：会议
`)
    const summary = getCalendarSummary(root, undefined, new Date(2026, 9, 26))
    expect(summary.planSource).toContain('PLAN.md')
    expect(summary.icsSource).toBeNull()
    expect(summary.events).toHaveLength(2)
    expect(summary.events[0]).toMatchObject({
      time: '09:00–11:00',
      summary: '深度工作',
      origin: 'plan',
    })
  })

  it('still works with empty plan (no blocks)', () => {
    const root = makeVault('# empty\n## 🕒 时间块划分\n\n')
    const summary = getCalendarSummary(root, undefined, new Date(2026, 9, 26))
    expect(summary.events).toHaveLength(0)
    expect(summary.planSource).toBeTruthy()
  })
})
