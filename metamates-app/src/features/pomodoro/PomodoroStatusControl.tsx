import React, { useEffect } from 'react'
import { Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../../store/AppContext'
import PomodoroReflectModal from './PomodoroReflectModal'
import { formatFocusMinutes } from './pomodoroStats'
import { usePomodoroController } from './usePomodoroController'

interface PomodoroStatusControlProps {
  workspacePath: string
  onOpenSettings?: () => void
}

/**
 * Status-bar pomodoro control: click to start/pause, menu for reset/break/settings.
 */
const PomodoroStatusControl: React.FC<PomodoroStatusControlProps> = ({
  workspacePath,
  onOpenSettings,
}) => {
  const { t } = useTranslation('common')
  const { state } = useAppContext()
  const pomo = usePomodoroController({
    workspacePath,
    onOpenSettings,
    focusMin: state.settings.pomodoroFocusMin,
    breakMin: state.settings.pomodoroBreakMin,
  })

  useEffect(() => {
    const w = window as Window & {
      __METAMATES_E2E__?: {
        enabled?: boolean
        registerPomodoroForceComplete?: (fn: (() => void) | null) => void
        pomodoroForceComplete?: () => void
      }
    }
    const e2e = w.__METAMATES_E2E__
    if (!e2e?.enabled) return
    e2e.registerPomodoroForceComplete?.(pomo.forceCompleteNow)
    return () => {
      e2e.registerPomodoroForceComplete?.(null)
    }
  }, [pomo.forceCompleteNow])

  if (!workspacePath) return null

  const tooltip = t('pomodoro.todayStats', {
    count: pomo.stats.todayCompletedFocus,
    minutes: Math.round(pomo.stats.todayFocusSec / 60),
  })

  const menuItems: MenuProps['items'] = [
    {
      key: 'reset',
      label: <span data-testid="pomodoro-menu-reset">{t('pomodoro.reset')}</span>,
      onClick: () => pomo.resetOrAbort(),
    },
    {
      key: 'break',
      label: <span data-testid="pomodoro-menu-break">{t('pomodoro.startBreak')}</span>,
      disabled: pomo.snapshot.phase !== 'idle',
      onClick: () => pomo.startBreak(),
    },
    {
      key: 'settings',
      label: <span data-testid="pomodoro-menu-settings">{t('pomodoro.openSettings')}</span>,
      onClick: () => onOpenSettings?.(),
    },
  ]

  return (
    <>
      <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
        <Tooltip title={tooltip}>
          <button
            type="button"
            className="status-bar-item"
            data-testid="pomodoro-status"
            data-phase={pomo.snapshot.phase}
            data-kind={pomo.snapshot.kind}
            onClick={() => pomo.togglePrimary()}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
              font: 'inherit',
            }}
            title={tooltip}
          >
            🍅 {pomo.label}
            {pomo.stats.todayCompletedFocus > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.75 }}>
                · {pomo.stats.todayCompletedFocus}× {formatFocusMinutes(pomo.stats.todayFocusSec)}
              </span>
            )}
          </button>
        </Tooltip>
      </Dropdown>

      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <button
          type="button"
          className="status-bar-item"
          data-testid="pomodoro-menu"
          aria-label={t('pomodoro.menu')}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '0 2px',
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
            opacity: 0.7,
          }}
        >
          ▾
        </button>
      </Dropdown>

      <PomodoroReflectModal
        open={!!pomo.reflect?.open}
        durationMin={Math.max(1, Math.round((pomo.reflect?.actualSec || 0) / 60))}
        onWrite={(note) => void pomo.finishReflect(note, true)}
        onSkip={() => void pomo.finishReflect('', false)}
      />
    </>
  )
}

export default PomodoroStatusControl
