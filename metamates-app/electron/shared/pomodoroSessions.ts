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

const DEFAULT_POMODORO_TZ = 'Asia/Shanghai'

/**
 * Calendar YYYY-MM-DD in a specific IANA timezone (not machine local).
 */
export function calendarDateInTimeZone(ms: number, timeZone: string): string {
  try {
    return new Date(ms).toLocaleDateString('sv-SE', { timeZone })
  } catch {
    return new Date(ms).toLocaleDateString('sv-SE', { timeZone: DEFAULT_POMODORO_TZ })
  }
}

function weekdayInTimeZone(ms: number, timeZone: string): number {
  const short = new Date(ms).toLocaleDateString('en-US', { timeZone, weekday: 'short' })
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[short] ?? new Date(ms).getDay()
}

function addDaysToDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utc = Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays)
  return new Date(utc).toISOString().slice(0, 10)
}

/** Monday (YYYY-MM-DD) of the week containing `now` in `timeZone`. */
export function mondayDateStringInTimeZone(nowMs: number, timeZone: string): string {
  const todayStr = calendarDateInTimeZone(nowMs, timeZone)
  const wd = weekdayInTimeZone(nowMs, timeZone)
  const diff = wd === 0 ? -6 : 1 - wd
  return addDaysToDateString(todayStr, diff)
}

function resolvePomodoroTimeZone(explicit?: string | null): string {
  if (explicit?.trim()) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: explicit.trim() })
      return explicit.trim()
    } catch {
      // fall through
    }
  }
  return DEFAULT_POMODORO_TZ
}

/**
 * Aggregate today / this week focus stats + recent sessions.
 * Day/week boundaries use `timeZone` (default Asia/Shanghai) so overnight
 * machine-local drift and user timezone settings stay aligned with diary dates.
 */
export function summarizePomodoroStats(
  workspacePath: string,
  now = new Date(),
  recentLimit = 20,
  timeZone?: string | null,
): PomodoroStatsSummary {
  const { sessions } = readPomodoroStore(workspacePath)
  const tz = resolvePomodoroTimeZone(timeZone)
  const nowMs = now.getTime()
  const todayStr = calendarDateInTimeZone(nowMs, tz)
  const weekMondayStr = mondayDateStringInTimeZone(nowMs, tz)

  let todayCompletedFocus = 0
  let todayFocusSec = 0
  let weekCompletedFocus = 0
  let weekFocusSec = 0

  for (const s of sessions) {
    if (s.kind !== 'focus') continue
    const ended = Date.parse(s.endedAt)
    if (!Number.isFinite(ended)) continue
    const sec = Math.max(0, s.actualSec || 0)
    const endedDate = calendarDateInTimeZone(ended, tz)
    if (endedDate >= weekMondayStr) {
      weekFocusSec += sec
      if (s.status === 'completed') weekCompletedFocus += 1
    }
    if (endedDate === todayStr) {
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
