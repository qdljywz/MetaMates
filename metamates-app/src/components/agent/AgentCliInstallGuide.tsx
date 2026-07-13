import React from 'react'
import { useTranslation } from 'react-i18next'
import { RobotOutlined } from '@ant-design/icons'
import { BRAND_I18N } from '../../constants/brand'

interface AgentCliInstallGuideProps {
  onInstall: () => void
  onRescan?: () => void
  rescanning?: boolean
}

/**
 * Persistent empty-state guide when no AI assistant is detected.
 * Copy is sourced from `common.brand` — the canonical product strings.
 */
const AgentCliInstallGuide: React.FC<AgentCliInstallGuideProps> = ({
  onInstall,
  onRescan,
  rescanning = false,
}) => {
  const { t } = useTranslation('common')
  const steps = [
    t(BRAND_I18N.installStep1),
    t(BRAND_I18N.installStep2),
    t(BRAND_I18N.installStep3),
  ]

  return (
    <div className="agent-cli-install-guide" data-testid="agent-cli-install-guide">
      <div className="agent-cli-install-guide__icon" aria-hidden>
        <RobotOutlined />
      </div>
      <p className="agent-cli-install-guide__eyebrow">{t(BRAND_I18N.thinkingEngine)}</p>
      <h2 className="agent-cli-install-guide__title">{t(BRAND_I18N.noAssistantTitle)}</h2>
      <p className="agent-cli-install-guide__value">{t(BRAND_I18N.noAssistantValue)}</p>

      <div className="agent-cli-install-guide__steps">
        <p className="agent-cli-install-guide__steps-title">{t(BRAND_I18N.installStepsTitle)}</p>
        <ol>
          {steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="agent-cli-install-guide__actions">
        <button type="button" className="agent-cli-install-guide__primary" onClick={onInstall}>
          {t(BRAND_I18N.installAssistant)}
        </button>
        {onRescan && (
          <button
            type="button"
            className="agent-cli-install-guide__secondary"
            onClick={onRescan}
            disabled={rescanning}
          >
            {rescanning ? t(BRAND_I18N.rescanning) : t(BRAND_I18N.rescan)}
          </button>
        )}
      </div>
    </div>
  )
}

export default AgentCliInstallGuide
