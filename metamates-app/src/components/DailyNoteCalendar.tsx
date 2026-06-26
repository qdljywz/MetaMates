import React, { memo, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../store/AppContext'
import {
  getDailyPlanDir,
  getTodayDateString,
  getWorkspaceLanguage,
  openOrCreateDailyEntry,
} from '../constants/paths'
import { workspaceIndexService } from '../services/workspaceIndex'

interface DailyNoteCalendarProps {
  onOpenNote: (path: string, name: string) => void
  onEntryCreated?: () => void
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

const DailyNoteCalendar = memo(({ onOpenNote, onEntryCreated }: DailyNoteCalendarProps) => {
  const { t, i18n } = useTranslation('sidebar')
  const { t: tCommon } = useTranslation('common')
  const { state } = useAppContext()
  const today = getTodayDateString()
  const now = new Date()
  const language = getWorkspaceLanguage(i18n.language)
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  useEffect(() => {
    return workspaceIndexService.onVaultChanged(() => {
      setRefreshKey((value) => value + 1)
    })
  }, [])

  const { noteDates, planDates } = useMemo(() => {
    if (!state.workspacePath) return { noteDates: new Set<string>(), planDates: new Set<string>() }
    const dailyDir = getDailyPlanDir(language)
    const notes = new Set<string>()
    const plans = new Set<string>()
    for (const file of workspaceIndexService.getAllFiles()) {
      const normalized = file.path.replace(/\\/g, '/')
      if (!normalized.includes(`/${dailyDir}/`)) continue
      const noteMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
      if (noteMatch) {
        notes.add(noteMatch[1])
        continue
      }
      const planMatch = file.name.match(/^(\d{4}-\d{2}-\d{2}) PLAN\.md$/)
      if (planMatch) plans.add(planMatch[1])
    }
    return { noteDates: notes, planDates: plans }
  }, [state.workspacePath, language, refreshKey])

  const recentEntries = useMemo(() => {
    const dates = new Set([...noteDates, ...planDates])
    return Array.from(dates)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 7)
      .flatMap((dateStr) => {
        const items: Array<{ dateStr: string; kind: 'note' | 'plan' }> = []
        if (noteDates.has(dateStr)) items.push({ dateStr, kind: 'note' })
        if (planDates.has(dateStr)) items.push({ dateStr, kind: 'plan' })
        return items
      })
  }, [noteDates, planDates])

  const weeks = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
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
    const result = await openOrCreateDailyEntry(state.workspacePath, dateStr, kind, language)
    if (!result) {
      message.error(
        kind === 'plan'
          ? tCommon('appShell.dailyPlanFailed')
          : tCommon('appShell.dailyNoteFailed')
      )
      return
    }
    if (result.created) {
      onEntryCreated?.()
      setRefreshKey((value) => value + 1)
      message.success(
        kind === 'plan'
          ? tCommon('appShell.dailyPlanCreated', { date: dateStr })
          : tCommon('appShell.dailyNoteCreated', { date: dateStr })
      )
    } else {
      message.info(
        kind === 'plan'
          ? tCommon('appShell.dailyPlanOpened', { date: dateStr })
          : tCommon('appShell.dailyNoteOpened', { date: dateStr })
      )
    }
    onOpenNote(result.path, result.name)
  }

  const openDate = async (date: Date, kind: 'note' | 'plan' = 'note') => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    await openEntry(dateStr, kind)
  }

  if (!state.workspacePath) return null

  return (
    <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid rgba(127,127,127,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{t('dailyCalendar.title')}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => shiftMonth(-1)} style={navButtonStyle}>‹</button>
          <button
            type="button"
            onClick={() => {
              setViewYear(now.getFullYear())
              setViewMonth(now.getMonth())
            }}
            style={{ ...navButtonStyle, fontSize: 10, padding: '2px 6px' }}
          >
            {t('dailyCalendar.today')}
          </button>
          <button type="button" onClick={() => shiftMonth(1)} style={navButtonStyle}>›</button>
        </div>
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
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            const hasNote = noteDates.has(dateStr)
            const hasPlan = planDates.has(dateStr)
            const isToday = dateStr === today
            const inViewMonth = date.getMonth() === viewMonth
            return (
              <button
                key={dateStr}
                type="button"
                onClick={(event) => void openDate(date, event.shiftKey ? 'plan' : 'note')}
                title={hasPlan ? t('dailyCalendar.openPlanHint') : (hasNote ? t('dailyCalendar.openExisting') : t('dailyCalendar.openOrCreate'))}
                style={{
                  position: 'relative',
                  border: isToday ? '1px solid #ff7a00' : '1px solid transparent',
                  borderRadius: 6,
                  background: hasNote ? 'rgba(255,122,0,0.18)' : 'transparent',
                  color: isToday ? '#ff7a00' : (inViewMonth ? 'inherit' : 'rgba(127,127,127,0.45)'),
                  cursor: 'pointer',
                  padding: '4px 0',
                  fontSize: 11,
                }}
              >
                {date.getDate()}
                {hasPlan && (
                  <span
                    style={{
                      position: 'absolute',
                      right: 3,
                      bottom: 2,
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: '#3b82f6',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      ))}

      {recentEntries.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>{t('dailyCalendar.recent')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentEntries.map((entry) => (
              <button
                key={`${entry.dateStr}-${entry.kind}`}
                type="button"
                onClick={() => void openEntry(entry.dateStr, entry.kind)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: entry.dateStr === today ? '#ff7a00' : 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                  padding: 0,
                }}
              >
                {entry.kind === 'plan' ? `${entry.dateStr} PLAN` : entry.dateStr}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

const navButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(127,127,127,0.25)',
  background: 'transparent',
  borderRadius: 6,
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 12,
}

DailyNoteCalendar.displayName = 'DailyNoteCalendar'

export default DailyNoteCalendar
