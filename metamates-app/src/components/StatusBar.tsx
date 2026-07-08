import React, { useEffect, useState } from 'react'
import { Space, Tooltip } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { storageService } from '../services/storage'

interface StatusBarProps {
  workspacePath?: string
  currentFile?: string
  onCreateDailyNote?: () => void
  onCreateDailyPlan?: () => void
}

const StatusBar: React.FC<StatusBarProps> = ({
  workspacePath = '',
  currentFile = '',
  onCreateDailyNote,
  onCreateDailyPlan,
}) => {
  const { t } = useTranslation('common')
  const [calendarCount, setCalendarCount] = useState<number | null>(null)
  const [calendarTooltip, setCalendarTooltip] = useState('')

  useEffect(() => {
    if (!workspacePath || !window.electronAPI?.calendar) {
      setCalendarCount(null)
      return
    }

    let cancelled = false

    const loadCalendar = async () => {
      const settings = await storageService.getSettings()
      const result = await window.electronAPI!.calendar.getEvents(
        workspacePath,
        settings.calendarIcsPath || undefined
      )
      if (cancelled || !result.success) return

      setCalendarCount(result.events.length)
      if (result.events.length === 0) {
        setCalendarTooltip(t('statusBar.noEventsToday'))
      } else {
        setCalendarTooltip(
          result.events.map((e) => `${e.time} ${e.summary}`).join('\n')
        )
      }
    }

    void loadCalendar()
    const timer = setInterval(loadCalendar, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [workspacePath, t])

  const shortcutButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
  }

  return (
    <div className="status-bar" role="contentinfo">
      <Space size={12}>
        {workspacePath && (
          <Tooltip title={workspacePath}>
            <span className="status-bar-item">📁 {workspacePath.split('\\').pop()}</span>
          </Tooltip>
        )}
        {currentFile && (
          <span className="status-bar-item">📄 {currentFile.split('\\').pop()}</span>
        )}
        {calendarCount !== null && (
          <Tooltip title={calendarTooltip}>
            <span className="status-bar-item">
              <CalendarOutlined style={{ marginRight: 4 }} />
              {t('statusBar.eventsToday', { count: calendarCount })}
            </span>
          </Tooltip>
        )}
      </Space>

      <Space size={12}>
        <span className="status-bar-shortcut">Ctrl+P</span>
        <span className="status-bar-label">{t('statusBar.commandPalette')}</span>
        <span className="status-bar-shortcut">Ctrl+Shift+F</span>
        <span className="status-bar-label">{t('statusBar.globalSearch')}</span>
        <span className="status-bar-shortcut">Ctrl+N</span>
        <button
          type="button"
          className="status-bar-label"
          style={shortcutButtonStyle}
          onClick={() => onCreateDailyNote?.()}
          title={t('statusBar.dailyNote')}
        >
          {t('statusBar.dailyNote')}
        </button>
        <span className="status-bar-shortcut">Ctrl+Shift+P</span>
        <button
          type="button"
          className="status-bar-label"
          style={shortcutButtonStyle}
          onClick={() => onCreateDailyPlan?.()}
          title={t('statusBar.dailyPlan')}
        >
          {t('statusBar.dailyPlan')}
        </button>
      </Space>
    </div>
  )
}

export default StatusBar
