/**
 * Pure Pomodoro timer state machine (wall-clock corrected ticks).
 */

export type PomodoroKind = 'focus' | 'break'
export type PomodoroPhase = 'idle' | 'running' | 'paused'

export interface PomodoroSnapshot {
  phase: PomodoroPhase
  kind: PomodoroKind
  /** Seconds left in the current segment (never negative). */
  remainingSec: number
  plannedSec: number
  /** Wall-clock ms when the current running segment started (null if not running). */
  segmentStartedAt: number | null
  /** Accumulated elapsed seconds before the current running segment. */
  elapsedBeforePauseSec: number
  /** Wall-clock ms when focus/break session began (null when idle). */
  sessionStartedAt: number | null
}

export const DEFAULT_FOCUS_MIN = 25
export const DEFAULT_BREAK_MIN = 5

/**
 * @param minutes - Focus or break length in minutes
 * @returns Seconds, clamped to at least 1 minute
 */
export function minutesToSec(minutes: number): number {
  const m = Number.isFinite(minutes) ? Math.round(minutes) : DEFAULT_FOCUS_MIN
  return Math.max(1, m) * 60
}

/**
 * @returns Idle snapshot ready for a focus session of `plannedSec`
 */
export function createIdleSnapshot(plannedSec = minutesToSec(DEFAULT_FOCUS_MIN)): PomodoroSnapshot {
  return {
    phase: 'idle',
    kind: 'focus',
    remainingSec: plannedSec,
    plannedSec,
    segmentStartedAt: null,
    elapsedBeforePauseSec: 0,
    sessionStartedAt: null,
  }
}

function clampRemaining(sec: number): number {
  return Math.max(0, Math.floor(sec))
}

/**
 * Compute remaining seconds from wall clock while running.
 */
export function computeRemaining(snapshot: PomodoroSnapshot, nowMs: number): number {
  if (snapshot.phase !== 'running' || snapshot.segmentStartedAt == null) {
    return clampRemaining(snapshot.remainingSec)
  }
  const elapsed =
    snapshot.elapsedBeforePauseSec + (nowMs - snapshot.segmentStartedAt) / 1000
  return clampRemaining(snapshot.plannedSec - elapsed)
}

/**
 * Start a focus or break session from idle (or reset into a new kind).
 */
export function startSession(
  _snapshot: PomodoroSnapshot,
  kind: PomodoroKind,
  plannedSec: number,
  nowMs: number,
): PomodoroSnapshot {
  const planned = Math.max(1, Math.floor(plannedSec))
  return {
    phase: 'running',
    kind,
    remainingSec: planned,
    plannedSec: planned,
    segmentStartedAt: nowMs,
    elapsedBeforePauseSec: 0,
    sessionStartedAt: nowMs,
  }
}

/**
 * Pause a running timer.
 */
export function pauseSession(snapshot: PomodoroSnapshot, nowMs: number): PomodoroSnapshot {
  if (snapshot.phase !== 'running') return snapshot
  const remaining = computeRemaining(snapshot, nowMs)
  const elapsed = snapshot.plannedSec - remaining
  return {
    ...snapshot,
    phase: 'paused',
    remainingSec: remaining,
    segmentStartedAt: null,
    elapsedBeforePauseSec: elapsed,
  }
}

/**
 * Resume from paused.
 */
export function resumeSession(snapshot: PomodoroSnapshot, nowMs: number): PomodoroSnapshot {
  if (snapshot.phase !== 'paused') return snapshot
  return {
    ...snapshot,
    phase: 'running',
    segmentStartedAt: nowMs,
  }
}

/**
 * Tick while running; returns `{ snapshot, completed }` when remaining hits 0.
 */
export function tickSession(
  snapshot: PomodoroSnapshot,
  nowMs: number,
): { snapshot: PomodoroSnapshot; completed: boolean } {
  if (snapshot.phase !== 'running') {
    return { snapshot, completed: false }
  }
  const remaining = computeRemaining(snapshot, nowMs)
  if (remaining <= 0) {
    return {
      snapshot: {
        ...snapshot,
        phase: 'idle',
        remainingSec: 0,
        segmentStartedAt: null,
        elapsedBeforePauseSec: snapshot.plannedSec,
      },
      completed: true,
    }
  }
  return {
    snapshot: { ...snapshot, remainingSec: remaining },
    completed: false,
  }
}

/**
 * Abort mid-session back to idle with the given planned reset duration.
 */
export function abortSession(
  plannedSec: number,
  kind: PomodoroKind = 'focus',
): PomodoroSnapshot {
  return {
    phase: 'idle',
    kind,
    remainingSec: plannedSec,
    plannedSec,
    segmentStartedAt: null,
    elapsedBeforePauseSec: 0,
    sessionStartedAt: null,
  }
}

/**
 * Format mm:ss for status bar.
 */
export function formatCountdown(totalSec: number): string {
  const s = clampRemaining(totalSec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/**
 * Actual elapsed seconds for a session ending at `nowMs`.
 */
export function actualElapsedSec(snapshot: PomodoroSnapshot, nowMs: number): number {
  if (snapshot.sessionStartedAt == null) return 0
  if (snapshot.phase === 'running' && snapshot.segmentStartedAt != null) {
    return Math.max(
      0,
      Math.round(
        snapshot.elapsedBeforePauseSec + (nowMs - snapshot.segmentStartedAt) / 1000,
      ),
    )
  }
  if (snapshot.phase === 'paused') {
    return Math.max(0, Math.round(snapshot.elapsedBeforePauseSec))
  }
  // completed → remaining was 0
  if (snapshot.remainingSec <= 0) return snapshot.plannedSec
  return Math.max(0, Math.round(snapshot.plannedSec - snapshot.remainingSec))
}
