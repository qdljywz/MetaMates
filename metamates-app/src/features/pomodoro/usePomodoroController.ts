import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { storageService } from '../../services/storage'
import {
  abortSession,
  actualElapsedSec,
  createIdleSnapshot,
  formatCountdown,
  minutesToSec,
  pauseSession,
  resumeSession,
  startSession,
  tickSession,
  type PomodoroSnapshot,
  DEFAULT_BREAK_MIN,
  DEFAULT_FOCUS_MIN,
} from './pomodoroMachine'
import { writePomodoroToDailyNote } from './writePomodoroToDailyNote'
import { emptyPomodoroStats, type PomodoroStatsSummary } from './pomodoroStats'
import type { PomodoroSessionRecord } from './types'

export interface ReflectState {
  open: boolean
  startedAt: Date
  endedAt: Date
  plannedSec: number
  actualSec: number
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pomo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Pomodoro timer + persist + reflect flow for the status bar.
 */
export function usePomodoroController(options: {
  workspacePath: string
  onOpenSettings?: () => void
  focusMin?: number
  breakMin?: number
}) {
  const { t, i18n } = useTranslation('common')
  const [snapshot, setSnapshot] = useState<PomodoroSnapshot>(() =>
    createIdleSnapshot(minutesToSec(DEFAULT_FOCUS_MIN)),
  )
  const [focusMin, setFocusMin] = useState(options.focusMin || DEFAULT_FOCUS_MIN)
  const [breakMin, setBreakMin] = useState(options.breakMin || DEFAULT_BREAK_MIN)
  const [stats, setStats] = useState<PomodoroStatsSummary>(emptyPomodoroStats)
  const [reflect, setReflect] = useState<ReflectState | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const completingRef = useRef(false)

  const focusSec = minutesToSec(focusMin)
  const breakSec = minutesToSec(breakMin)

  useEffect(() => {
    const fm = Number(options.focusMin) || DEFAULT_FOCUS_MIN
    const bm = Number(options.breakMin) || DEFAULT_BREAK_MIN
    setFocusMin(fm)
    setBreakMin(bm)
    setSnapshot((prev) => {
      if (prev.phase !== 'idle') return prev
      return createIdleSnapshot(minutesToSec(fm))
    })
  }, [options.focusMin, options.breakMin])

  const refreshStats = useCallback(async () => {
    if (!options.workspacePath || !window.electronAPI?.pomodoro?.getStats) {
      setStats(emptyPomodoroStats())
      return
    }
    try {
      const result = await window.electronAPI.pomodoro.getStats(options.workspacePath)
      if (result.success && result.stats) {
        setStats(result.stats as PomodoroStatsSummary)
      }
    } catch {
      // ignore
    }
  }, [options.workspacePath])

  const persistSession = useCallback(
    async (record: Omit<PomodoroSessionRecord, 'id'> & { id?: string }) => {
      if (!options.workspacePath || !window.electronAPI?.pomodoro?.appendSession) return
      const full: PomodoroSessionRecord = {
        id: record.id || newSessionId(),
        kind: record.kind,
        status: record.status,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        plannedSec: record.plannedSec,
        actualSec: record.actualSec,
        note: record.note || '',
        dailyNotePath: record.dailyNotePath,
      }
      try {
        await window.electronAPI.pomodoro.appendSession(options.workspacePath, full)
        await refreshStats()
      } catch (err) {
        console.error('[pomodoro] persist failed', err)
      }
    },
    [options.workspacePath, refreshStats],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const settings = await storageService.getSettings()
      if (cancelled) return
      const fm = Number(settings.pomodoroFocusMin) || DEFAULT_FOCUS_MIN
      const bm = Number(settings.pomodoroBreakMin) || DEFAULT_BREAK_MIN
      setFocusMin(fm)
      setBreakMin(bm)
      setSnapshot((prev) => {
        if (prev.phase !== 'idle') return prev
        return createIdleSnapshot(minutesToSec(fm))
      })
    })()
    return () => {
      cancelled = true
    }
  }, [options.workspacePath])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  // Overnight / long-lived sessions: recompute "today" when day rolls or window regains focus.
  useEffect(() => {
    if (!options.workspacePath) return
    let cancelled = false
    let inFlight = false
    const safeRefresh = () => {
      if (cancelled || inFlight) return
      inFlight = true
      void refreshStats().finally(() => {
        inFlight = false
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') safeRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', safeRefresh)
    const id = window.setInterval(safeRefresh, 60_000)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', safeRefresh)
      window.clearInterval(id)
    }
  }, [options.workspacePath, refreshStats])

  const handleCompleted = useCallback(
    (snap: PomodoroSnapshot, nowMs: number) => {
      if (completingRef.current) return
      completingRef.current = true
      const startedAt = snap.sessionStartedAt
        ? new Date(snap.sessionStartedAt)
        : new Date(nowMs - snap.plannedSec * 1000)
      const endedAt = new Date(nowMs)
      const actualSec = snap.plannedSec

      if (snap.kind === 'break') {
        void persistSession({
          kind: 'break',
          status: 'completed',
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          plannedSec: snap.plannedSec,
          actualSec,
          note: '',
        })
        setSnapshot(createIdleSnapshot(focusSec))
        message.success(t('pomodoro.breakDone'))
        completingRef.current = false
        return
      }

      setReflect({
        open: true,
        startedAt,
        endedAt,
        plannedSec: snap.plannedSec,
        actualSec,
      })
      setSnapshot(createIdleSnapshot(focusSec))
      message.success(t('pomodoro.focusDone'))
    },
    [focusSec, persistSession, t],
  )

  // Wall-clock tick
  useEffect(() => {
    if (snapshot.phase !== 'running') return
    const id = window.setInterval(() => {
      const now = Date.now()
      const { snapshot: next, completed } = tickSession(snapshotRef.current, now)
      setSnapshot(next)
      if (completed) handleCompleted(snapshotRef.current, now)
    }, 250)
    return () => window.clearInterval(id)
  }, [snapshot.phase, handleCompleted])

  // Optional taskbar progress
  useEffect(() => {
    const winProgress = window.electronAPI?.pomodoro?.setProgress
    if (!winProgress) return
    if (snapshot.phase === 'running' || snapshot.phase === 'paused') {
      const ratio =
        snapshot.plannedSec > 0
          ? Math.min(1, Math.max(0, 1 - snapshot.remainingSec / snapshot.plannedSec))
          : 0
      void winProgress(ratio)
    } else {
      void winProgress(-1)
    }
  }, [snapshot.phase, snapshot.remainingSec, snapshot.plannedSec])

  const togglePrimary = useCallback(() => {
    const now = Date.now()
    const cur = snapshotRef.current
    if (cur.phase === 'idle') {
      setSnapshot(startSession(cur, 'focus', focusSec, now))
      return
    }
    if (cur.phase === 'running') {
      setSnapshot(pauseSession(cur, now))
      return
    }
    if (cur.phase === 'paused') {
      setSnapshot(resumeSession(cur, now))
    }
  }, [focusSec])

  const startBreak = useCallback(() => {
    const now = Date.now()
    setSnapshot(startSession(createIdleSnapshot(breakSec), 'break', breakSec, now))
  }, [breakSec])

  const resetOrAbort = useCallback(() => {
    const now = Date.now()
    const cur = snapshotRef.current
    if (cur.phase === 'running' || cur.phase === 'paused') {
      const startedAt = cur.sessionStartedAt
        ? new Date(cur.sessionStartedAt)
        : new Date(now)
      const actual = actualElapsedSec(cur, now)
      void persistSession({
        kind: cur.kind,
        status: 'aborted',
        startedAt: startedAt.toISOString(),
        endedAt: new Date(now).toISOString(),
        plannedSec: cur.plannedSec,
        actualSec: actual,
        note: '',
      })
    }
    setSnapshot(abortSession(focusSec, 'focus'))
    completingRef.current = false
  }, [focusSec, persistSession])

  const finishReflect = useCallback(
    async (note: string, writeDiary: boolean) => {
      const state = reflect
      setReflect(null)
      completingRef.current = false
      if (!state) return

      const trimmed = note.trim()
      let dailyNotePath: string | undefined
      if (writeDiary) {
        dailyNotePath =
          (await writePomodoroToDailyNote({
            workspacePath: options.workspacePath,
            language: i18n.language,
            startedAt: state.startedAt,
            endedAt: state.endedAt,
            durationMin: Math.max(1, Math.round(state.actualSec / 60)),
            note: trimmed,
          })) || undefined
        if (dailyNotePath) message.success(t('pomodoro.diaryWritten'))
      }

      await persistSession({
        kind: 'focus',
        status: 'completed',
        startedAt: state.startedAt.toISOString(),
        endedAt: state.endedAt.toISOString(),
        plannedSec: state.plannedSec,
        actualSec: state.actualSec,
        note: trimmed,
        dailyNotePath,
      })
    },
    [reflect, options.workspacePath, i18n.language, persistSession, t],
  )

  /** E2E: force-complete the running session immediately. */
  const forceCompleteNow = useCallback(() => {
    const cur = snapshotRef.current
    if (cur.phase !== 'running' && cur.phase !== 'paused') return
    const now = Date.now()
    const forced: PomodoroSnapshot = {
      ...cur,
      phase: 'idle',
      remainingSec: 0,
      segmentStartedAt: null,
      elapsedBeforePauseSec: cur.plannedSec,
    }
    setSnapshot(forced)
    handleCompleted({ ...cur, remainingSec: 0 }, now)
  }, [handleCompleted])

  const label = (() => {
    const time = formatCountdown(snapshot.remainingSec)
    if (snapshot.phase === 'idle') return t('pomodoro.statusIdle', { time })
    if (snapshot.kind === 'break') {
      return snapshot.phase === 'paused'
        ? t('pomodoro.statusBreakPaused', { time })
        : t('pomodoro.statusBreak', { time })
    }
    return snapshot.phase === 'paused'
      ? t('pomodoro.statusFocusPaused', { time })
      : t('pomodoro.statusFocus', { time })
  })()

  return {
    snapshot,
    label,
    stats,
    reflect,
    focusMin,
    breakMin,
    togglePrimary,
    startBreak,
    resetOrAbort,
    finishReflect,
    forceCompleteNow,
    openSettings: options.onOpenSettings,
    refreshStats,
  }
}

export type PomodoroController = ReturnType<typeof usePomodoroController>
