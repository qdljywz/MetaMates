import React, { memo, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import './DailyNoteCalendar.css'
import { useAppContext } from '../store/AppContext'
import {
  getTodayDateString,
  openOrCreateDailyEntry,
  resolveUserTimezone,
} from '../constants/paths'
import { workspaceIndexService } from '../services/workspaceIndex'
import {
  activityLevel,
  loadVaultActivitySnapshot,
  formatEditTime,
  type VaultActivitySnapshot,
} from '../utils/vaultActivityCalendar'
import { useTheme } from '../hooks/useTheme'

const EMPTY_ACTIVITY: VaultActivitySnapshot = {
  byDate: new Map(),
  noteDates: new Set(),
  planDates: new Set(),
  recent: [],
}

interface DailyNoteCalendarProps {
  onOpenNote: (path: string, name: string) => void
  onEntryCreated?: () => void
  onOpenInGraph?: (paths: string[], dateLabel: string) => void
}

function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const weeks: (Date | null)[][] = []
  let currentWeek: (Date | null)[] = new Array(firstDay.getDay()).fill(null)

  for (let day = 1; day <= lastDay.getDate(); day++) {
    currentWeek.push(new Date(year, month, day))
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null)
    weeks.push(currentWeek)
  }

  return weeks
}

function dateToStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const ACTIVITY_ALPHA = [0, 0.1, 0.16, 0.24, 0.34]

const DailyNoteCalendar = memo(({ onOpenNote, onEntryCreated, onOpenInGraph }: DailyNoteCalendarProps) => {
  const { t, i18n } = useTranslation('sidebar')
  const { t: tCommon } = useTranslation('common')
  const { state } = useAppContext()
  const { theme } = useTheme()
  const timezone = resolveUserTimezone(state.settings.userTimezone)
  const today = getTodayDateString(timezone)
  const now = new Date()
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(today)
  const [activity, setActivity] = useState<VaultActivitySnapshot>(EMPTY_ACTIVITY)

  useEffect(() => {
    const bump = () => setRefreshKey((value) => value + 1)
    const unsubVault = workspaceIndexService.onVaultChanged(bump)
    const unsubIndex = workspaceIndexService.subscribe(bump)
    return () => {
      unsubVault()
      unsubIndex()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!state.workspacePath) {
        setActivity(EMPTY_ACTIVITY)
        return
      }
      const language = workspaceIndexService.isReady()
        ? workspaceIndexService.getWorkspaceLanguage()
        : undefined
      const snapshot = await loadVaultActivitySnapshot(state.workspacePath, language)
      if (!cancelled) setActivity(snapshot)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [state.workspacePath, refreshKey])

  const selectedEntries = useMemo(
    () => activity.byDate.get(selectedDate) ?? [],
    [activity.byDate, selectedDate],
  )

  const weeks = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  )
  const actionChipStyle = useMemo<React.CSSProperties>(
    () => (theme.mode === 'dark' ? darkActionChipStyle : lightActionChipStyle),
    [theme.mode],
  )
  const navButtonStyle = useMemo<React.CSSProperties>(
    () => (theme.mode === 'dark' ? darkNavButtonStyle : lightNavButtonStyle),
    [theme.mode],
  )

  const monthLabel = useMemo(() => {
    const date = new Date(viewYear, viewMonth, 1)
    return date.toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
    })
  }, [viewYear, viewMonth, i18n.language])

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  const openEntry = async (dateStr: string, kind: 'note' | 'plan') => {
    if (!state.workspacePath) return
    const vaultLanguage = workspaceIndexService.getWorkspaceLanguage()
    const result = await openOrCreateDailyEntry(state.workspacePath, dateStr, kind, vaultLanguage)
    if (!result) {
      message.error(
        kind === 'plan'
          ? tCommon('appShell.dailyPlanFailed')
          : tCommon('appShell.dailyNoteFailed'),
      )
      return
    }
    if (result.created) {
      onEntryCreated?.()
      setRefreshKey((value) => value + 1)
      message.success(
        kind === 'plan'
          ? tCommon('appShell.dailyPlanCreated', { date: dateStr })
          : tCommon('appShell.dailyNoteCreated', { date: dateStr }),
      )
    } else {
      message.info(
        kind === 'plan'
          ? tCommon('appShell.dailyPlanOpened', { date: dateStr })
          : tCommon('appShell.dailyNoteOpened', { date: dateStr }),
      )
    }
    onOpenNote(result.path, result.name)
  }

  const handleDateClick = (date: Date, event: React.MouseEvent) => {
    const dateStr = dateToStr(date)
    if (event.shiftKey) {
      void openEntry(dateStr, 'plan')
      return
    }
    setSelectedDate(dateStr)
  }

  const handleDateDoubleClick = (date: Date) => {
    void openEntry(dateToStr(date), 'note')
  }

  if (!state.workspacePath) return null

  const listTitle = selectedDate === today
    ? t('dailyCalendar.editedToday')
    : t('dailyCalendar.editedOn', { date: selectedDate })

  return (
    <div className="vault-activity-calendar" style={{ padding: '8px 12px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{t('dailyCalendar.title')}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="daily-nav-button" onClick={() => shiftMonth(-1)} style={navButtonStyle}>‹</button>
          <button
            type="button"
            className="daily-nav-button"
            onClick={() => {
              setViewYear(now.getFullYear())
              setViewMonth(now.getMonth())
              setSelectedDate(today)
            }}
            style={{ ...navButtonStyle, fontSize: 10, padding: '2px 6px' }}
          >
            {t('dailyCalendar.today')}
          </button>
          <button type="button" className="daily-nav-button" onClick={() => shiftMonth(1)} style={navButtonStyle}>›</button>
        </div>
      </div>

      <div style={{ fontSize: 10, opacity: 0.65, marginBottom: 8, lineHeight: 1.45 }}>
        {t('dailyCalendar.subtitle')}
      </div>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>{monthLabel}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 11, marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
          <div key={`${label}-${index}`} style={{ textAlign: 'center', opacity: 0.6 }}>{label}</div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {week.map((date, dayIndex) => {
            if (!date) {
              return <div key={dayIndex} />
            }
            const dateStr = dateToStr(date)
            const dayActivity = activity.byDate.get(dateStr) ?? []
            const level = activityLevel(dayActivity.length)
            const hasNote = activity.noteDates.has(dateStr)
            const hasPlan = activity.planDates.has(dateStr)
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const inViewMonth = date.getMonth() === viewMonth
            const heatBackground = level > 0 ? `rgba(255,122,0,${ACTIVITY_ALPHA[level]})` : 'transparent'
            const noteBackground = hasNote && level === 0 ? 'rgba(255,122,0,0.18)' : 'transparent'
            return (
              <button
                key={dateStr}
                type="button"
                data-testid={`calendar-date-${dateStr}`}
                onClick={(event) => handleDateClick(date, event)}
                onDoubleClick={() => handleDateDoubleClick(date)}
                title={t('dailyCalendar.dateHint')}
                style={{
                  position: 'relative',
                  border: isSelected
                    ? '1px solid var(--accent)'
                    : (isToday ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' : '1px solid transparent'),
                  borderRadius: 6,
                  background: level > 0 ? heatBackground : noteBackground,
                  color: isToday ? 'var(--accent)' : (inViewMonth ? 'inherit' : 'var(--text-dim)'),
                  cursor: 'pointer',
                  padding: '4px 0',
                  fontSize: 11,
                  fontWeight: isSelected ? 600 : 400,
                  minHeight: 26,
                }}
              >
                {date.getDate()}
                {(hasNote || hasPlan) && (
                  <span style={{ position: 'absolute', right: 2, bottom: 2, display: 'flex', gap: 2 }}>
                    {hasNote && (
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />
                    )}
                    {hasPlan && (
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--info)' }} />
                    )}
                  </span>
                )}
                {!hasNote && !hasPlan && level > 0 && (
                  <span style={{ position: 'absolute', right: 3, bottom: 2, display: 'flex', gap: 1 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,122,0,0.85)' }} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>{listTitle}</div>
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            {t('dailyCalendar.fileCount', { count: selectedEntries.length })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void openEntry(selectedDate, 'note')}
            className="daily-action-chip"
            style={actionChipStyle}
          >
            {t('dailyCalendar.openDiary')}
          </button>
          <button
            type="button"
            onClick={() => void openEntry(selectedDate, 'plan')}
            className="daily-action-chip"
            style={actionChipStyle}
          >
            {t('dailyCalendar.openPlan')}
          </button>
          {selectedEntries.length > 0 && onOpenInGraph && (
            <button
              type="button"
              onClick={() => onOpenInGraph(selectedEntries.map((entry) => entry.path), selectedDate)}
              className="daily-action-chip"
              style={actionChipStyle}
            >
              {t('dailyCalendar.openInGraph')}
            </button>
          )}
        </div>

        {selectedEntries.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
            {selectedEntries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => onOpenNote(entry.path, entry.name)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                  padding: '2px 0',
                  lineHeight: 1.35,
                }}
              >
                <span style={{ opacity: 0.55, marginRight: 6 }}>
                  {formatEditTime(entry.lastModified, i18n.language)}
                </span>
                <span style={{ color: entry.dailyKind === 'plan' ? 'var(--info)' : (entry.dailyKind === 'note' ? 'var(--accent)' : 'inherit') }}>
                  {entry.relativePath || entry.name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.45 }}>
            {t('dailyCalendar.noEdits')}
          </div>
        )}
      </div>
    </div>
  )
})

const lightNavButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(127,127,127,0.25)',
  background: 'transparent',
  borderRadius: 6,
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 12,
}

const darkNavButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.28)',
  background: 'rgba(15,15,20,0.9)',
  borderRadius: 6,
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 12,
  color: '#f9fafb',
}

const lightActionChipStyle: React.CSSProperties = {
  border: '1px solid rgba(127,127,127,0.25)',
  background: 'transparent',
  borderRadius: 999,
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 10,
}

const darkActionChipStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.28)',
  background: 'rgba(15,15,20,0.9)',
  borderRadius: 999,
  cursor: 'pointer',
  padding: '3px 10px',
  fontSize: 11,
  color: '#f9fafb',
}

DailyNoteCalendar.displayName = 'DailyNoteCalendar'

export default DailyNoteCalendar
