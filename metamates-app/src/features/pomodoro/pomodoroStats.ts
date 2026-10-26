import type { PomodoroSessionRecord, PomodoroStatsSummary } from './types'

export type { PomodoroSessionRecord, PomodoroStatsSummary }

/**
 * Format focus seconds as "Xm" for status-bar tooltips.
 */
export function formatFocusMinutes(sec: number): string {
  const mins = Math.max(0, Math.round(sec / 60))
  return `${mins}m`
}

/**
 * Empty stats when no workspace / IPC unavailable.
 */
export function emptyPomodoroStats(): PomodoroStatsSummary {
  return {
    todayCompletedFocus: 0,
    todayFocusSec: 0,
    weekCompletedFocus: 0,
    weekFocusSec: 0,
    recent: [],
  }
}
