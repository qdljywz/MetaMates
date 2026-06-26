import React, { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentModeOption } from '../../utils/agentModes'
import './AgentPanel.css'

interface AgentModePillProps {
  selectedMode: string
  modeOptions: AgentModeOption[]
  onModeChange: (mode: string) => void
  disabled?: boolean
}

const MODE_ICONS: Record<string, string> = {
  yolo: '🛡',
  default: '✋',
  plan: '📋',
  acceptEdits: '✓',
  autoEdit: '✓',
  readOnly: '👁',
  fullAccess: '⚡',
}

function modeIcon(value: string): string {
  return MODE_ICONS[value] || '⚙'
}

/** Compact mode selector — styled pill, keeps data-testid="agent-mode-select" for E2E. */
const AgentModePill = memo(({
  selectedMode,
  modeOptions,
  onModeChange,
  disabled = false,
}: AgentModePillProps) => {
  const { t } = useTranslation('agent')

  const resolvedMode = modeOptions.some((m) => m.value === selectedMode)
    ? selectedMode
    : modeOptions[0]?.value ?? selectedMode

  const options = useMemo(
    () => modeOptions.map((mode) => ({
      ...mode,
      label: t(`modes.${mode.labelKey}`, { defaultValue: mode.value }),
    })),
    [modeOptions, t],
  )

  if (modeOptions.length === 0) return null

  return (
    <label className="agent-panel__mode-pill" data-testid="agent-mode-pill">
      <span className="agent-panel__mode-pill-icon" aria-hidden>{modeIcon(resolvedMode)}</span>
      <select
        className="agent-panel__mode-pill-select"
        data-testid="agent-mode-select"
        value={resolvedMode}
        disabled={disabled}
        aria-label={t('session.mode')}
        onChange={(e) => onModeChange(e.target.value)}
      >
        {options.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
      <span className="agent-panel__mode-pill-caret" aria-hidden>▾</span>
    </label>
  )
})

AgentModePill.displayName = 'AgentModePill'

export default AgentModePill
