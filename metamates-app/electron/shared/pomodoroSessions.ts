import * as fs from 'fs'
import * as path from 'path'
import { WORKSPACE_CHAT_DIR } from './conversationDbPath'
import { normalizeWorkspacePath } from './workspacePath'

export const POMODORO_SESSIONS_FILE = 'pomodoro-sessions.json'

export type PomodoroSessionKind = 'focus' | 'break'
export type PomodoroSessionStatus = 'completed' | 'aborted'

export interface PomodoroSessionRecord {
  id: string
  kind: PomodoroSessionKind
  status: PomodoroSessionStatus
  startedAt: string
  endedAt: string
  plannedSec: number
  actualSec: number
  note: string
  dailyNotePath?: string
}

export interface PomodoroStoreFile {
  version: 1
  sessions: PomodoroSessionRecord[]
}

export interface PomodoroStatsSummary {
  todayCompletedFocus: number
  todayFocusSec: number
  weekCompletedFocus: number
  weekFocusSec: number
  recent: PomodoroSessionRecord[]
}

/**
 * Absolute path to the vault-local pomodoro sessions file.
 */
export function resolvePomodoroSessionsPath(workspacePath: string): string {
  const ws = normalizeWorkspacePath(workspacePath)
  return path.join(ws, WORKSPACE_CHAT_DIR, POMODORO_SESSIONS_FILE)
}

function emptyStore(): PomodoroStoreFile {
  return { version: 1, sessions: [] }
}

/**
 * Read sessions file (returns empty store if missing/corrupt).
 */
export function readPomodoroStore(workspacePath: string): PomodoroStoreFile {
  const filePath = resolvePomodoroSessionsPath(workspacePath)
  if (!fs.existsSync(filePath)) return emptyStore()
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PomodoroStoreFile
    if (!raw || !Array.isArray(raw.sessions)) return emptyStore()
    return { version: 1, sessions: raw.sessions }
  } catch {
    return emptyStore()
  }
}

/**
 * Persist store atomically-ish (write temp then rename).
 */
export function writePomodoroStore(workspacePath: string, store: PomodoroStoreFile): void {
  const ws = normalizeWorkspacePath(workspacePath)
  if (!ws) throw new Error('No workspace for pomodoro store')
  const dir = path.join(ws, WORKSPACE_CHAT_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, POMODORO_SESSIONS_FILE)
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, sessions: store.sessions }, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

/**
 * Append one session record.
 */
export function appendPomodoroSession(
  workspacePath: string,
  record: PomodoroSessionRecord,
): PomodoroSessionRecord {
  const store = readPomodoroStore(workspacePath)
  store.sessions.push(record)
  writePomodoroStore(workspacePath, store)
  return record
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0, 0)
  return monday
}

/**
 * Aggregate today / this week focus stats + recent sessions.
 */
export function summarizePomodoroStats(
  workspacePath: string,
  now = new Date(),
  recentLimit = 20,
): PomodoroStatsSummary {
  const { sessions } = readPomodoroStore(workspacePath)
  const dayStart = startOfLocalDay(now).getTime()
  const weekStart = startOfWeekMonday(now).getTime()

  let todayCompletedFocus = 0
  let todayFocusSec = 0
  let weekCompletedFocus = 0
  let weekFocusSec = 0

  for (const s of sessions) {
    if (s.kind !== 'focus') continue
    const ended = Date.parse(s.endedAt)
    if (!Number.isFinite(ended)) continue
    const sec = Math.max(0, s.actualSec || 0)
    if (ended >= weekStart) {
      weekFocusSec += sec
      if (s.status === 'completed') weekCompletedFocus += 1
    }
    if (ended >= dayStart) {
      todayFocusSec += sec
      if (s.status === 'completed') todayCompletedFocus += 1
    }
  }

  const recent = sessions.slice(-recentLimit).reverse()
  return {
    todayCompletedFocus,
    todayFocusSec,
    weekCompletedFocus,
    weekFocusSec,
    recent,
  }
}
