import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendPomodoroSession,
  readPomodoroStore,
  resolvePomodoroSessionsPath,
  summarizePomodoroStats,
} from './pomodoroSessions'

describe('pomodoroSessions store', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  function tempWorkspace(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomo-ws-'))
    dirs.push(dir)
    return dir
  }

  it('appends sessions under .metamates/pomodoro-sessions.json', () => {
    const ws = tempWorkspace()
    const file = resolvePomodoroSessionsPath(ws)
    expect(file.replace(/\\/g, '/')).toContain('/.metamates/pomodoro-sessions.json')

    appendPomodoroSession(ws, {
      id: 'a1',
      kind: 'focus',
      status: 'completed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      plannedSec: 1500,
      actualSec: 1500,
      note: 'test',
    })

    const store = readPomodoroStore(ws)
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].note).toBe('test')
    expect(fs.existsSync(file)).toBe(true)
  })

  it('summarizes today/week focus stats', () => {
    const ws = tempWorkspace()
    const now = new Date()
    appendPomodoroSession(ws, {
      id: 'f1',
      kind: 'focus',
      status: 'completed',
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      plannedSec: 1500,
      actualSec: 1500,
      note: '',
    })
    appendPomodoroSession(ws, {
      id: 'b1',
      kind: 'break',
      status: 'completed',
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      plannedSec: 300,
      actualSec: 300,
      note: '',
    })

    const stats = summarizePomodoroStats(ws, now)
    expect(stats.todayCompletedFocus).toBe(1)
    expect(stats.todayFocusSec).toBe(1500)
    expect(stats.weekCompletedFocus).toBe(1)
    expect(stats.recent[0].id).toBe('b1')
  })
})
