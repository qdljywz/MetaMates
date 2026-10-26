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

export interface PomodoroStatsSummary {
  todayCompletedFocus: number
  todayFocusSec: number
  weekCompletedFocus: number
  weekFocusSec: number
  recent: PomodoroSessionRecord[]
}
