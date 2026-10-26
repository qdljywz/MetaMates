import { describe, expect, it } from 'vitest'
import {
  abortSession,
  actualElapsedSec,
  computeRemaining,
  createIdleSnapshot,
  formatCountdown,
  minutesToSec,
  pauseSession,
  resumeSession,
  startSession,
  tickSession,
} from './pomodoroMachine'

describe('pomodoroMachine', () => {
  it('converts minutes to seconds with a 1-minute floor', () => {
    expect(minutesToSec(25)).toBe(1500)
    expect(minutesToSec(0)).toBe(60)
    expect(minutesToSec(-3)).toBe(60)
  })

  it('starts, pauses, resumes with wall-clock correction', () => {
    const t0 = 1_000_000
    let snap = createIdleSnapshot(60)
    snap = startSession(snap, 'focus', 60, t0)
    expect(snap.phase).toBe('running')
    expect(computeRemaining(snap, t0 + 10_000)).toBe(50)

    snap = pauseSession(snap, t0 + 10_000)
    expect(snap.phase).toBe('paused')
    expect(snap.remainingSec).toBe(50)
    expect(computeRemaining(snap, t0 + 30_000)).toBe(50)

    snap = resumeSession(snap, t0 + 30_000)
    expect(computeRemaining(snap, t0 + 40_000)).toBe(40)
  })

  it('marks completed when remaining hits zero', () => {
    const t0 = 5_000_000
    let snap = startSession(createIdleSnapshot(30), 'focus', 30, t0)
    const mid = tickSession(snap, t0 + 10_000)
    expect(mid.completed).toBe(false)
    expect(mid.snapshot.remainingSec).toBe(20)

    const done = tickSession(mid.snapshot, t0 + 30_000)
    expect(done.completed).toBe(true)
    expect(done.snapshot.phase).toBe('idle')
    expect(done.snapshot.remainingSec).toBe(0)
    expect(actualElapsedSec(done.snapshot, t0 + 30_000)).toBe(30)
  })

  it('aborts back to idle with reset duration', () => {
    const snap = abortSession(1500, 'focus')
    expect(snap.phase).toBe('idle')
    expect(snap.remainingSec).toBe(1500)
    expect(snap.sessionStartedAt).toBeNull()
  })

  it('formats countdown as mm:ss', () => {
    expect(formatCountdown(1500)).toBe('25:00')
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(0)).toBe('00:00')
  })
})
