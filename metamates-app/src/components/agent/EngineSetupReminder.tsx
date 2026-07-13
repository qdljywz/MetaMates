import React from 'react'
import { useTranslation } from 'react-i18next'
import { CloseOutlined } from '@ant-design/icons'

interface EngineSetupReminderProps {
  onEnable: () => void
  onDismiss: () => void
}

/**
 * Compact banner for users who skipped engine setup (vault_only).
 */
const EngineSetupReminder: React.FC<EngineSetupReminderProps> = ({ onEnable, onDismiss }) => {
  const { t } = useTranslation('engineSetup')

  return (
    <div
      className="agent-panel__alert-banner agent-panel__alert-banner--info"
      data-testid="engine-setup-reminder"
      role="status"
    >
      <span className="agent-panel__alert-banner-text">{t('vaultReminder.message')}</span>
      <button type="button" className="agent-panel__alert-action" onClick={onEnable}>
        {t('vaultReminder.action')}
      </button>
      <button
        type="button"
        className="agent-panel__vault-reminder-dismiss"
        onClick={onDismiss}
        aria-label={t('vaultReminder.dismiss')}
      >
        <CloseOutlined />
      </button>
    </div>
  )
}

export default EngineSetupReminder
