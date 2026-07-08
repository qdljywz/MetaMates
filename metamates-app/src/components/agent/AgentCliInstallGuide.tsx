import React from 'react'
import { useTranslation } from 'react-i18next'
import { RobotOutlined } from '@ant-design/icons'

interface AgentCliInstallGuideProps {
  onInstall: () => void
  onRescan?: () => void
  rescanning?: boolean
}

/**
 * Persistent empty-state guide when no CLI agent is detected.
 * Explains MetaMates value depends on the thinking engine and routes users to install.
 */
const AgentCliInstallGuide: React.FC<AgentCliInstallGuideProps> = ({
  onInstall,
  onRescan,
  rescanning = false,
}) => {
  const { t } = useTranslation('agent')
  const steps = [t('empty.step1'), t('empty.step2'), t('empty.step3')]

  return (
    <div className="agent-cli-install-guide" data-testid="agent-cli-install-guide">
      <div className="agent-cli-install-guide__icon" aria-hidden>
        <RobotOutlined />
      </div>
      <p className="agent-cli-install-guide__eyebrow">{t('empty.panelLabel')}</p>
      <h2 className="agent-cli-install-guide__title">{t('empty.title')}</h2>
      <p className="agent-cli-install-guide__value">{t('empty.valueStatement')}</p>

      <div className="agent-cli-install-guide__steps">
        <p className="agent-cli-install-guide__steps-title">{t('empty.stepsTitle')}</p>
        <ol>
          {steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="agent-cli-install-guide__actions">
        <button type="button" className="agent-cli-install-guide__primary" onClick={onInstall}>
          {t('empty.installButton')}
        </button>
        {onRescan && (
          <button
            type="button"
            className="agent-cli-install-guide__secondary"
            onClick={onRescan}
            disabled={rescanning}
          >
            {rescanning ? t('empty.rescanning') : t('empty.rescan')}
          </button>
        )}
      </div>
    </div>
  )
}

export default AgentCliInstallGuide
