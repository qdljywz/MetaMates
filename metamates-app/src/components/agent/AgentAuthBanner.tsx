import React, { memo } from 'react'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'

import './AgentPanel.css'

interface AgentAuthBannerProps {
  backend: string
  agentName?: string
  error?: string
  onSignIn: () => void
  onOpenSettings: () => void
}

const AgentAuthBanner = memo(({
  backend,
  agentName,
  error,
  onSignIn,
  onOpenSettings,
}: AgentAuthBannerProps) => {
  const { t } = useTranslation('agent')
  const label = agentName || backend

  return (
    <div className="agent-panel__auth-banner" data-testid="acp-auth-banner" data-backend={backend}>
      <div className="agent-panel__auth-banner-text">
        <strong>{t('auth.bannerTitle', { name: label })}</strong>
        <span>{error || t('auth.bannerHint')}</span>
      </div>
      <div className="agent-panel__auth-banner-actions">
        <Button size="small" type="primary" onClick={onSignIn} data-testid="acp-auth-banner-sign-in">
          {t('actions.login')}
        </Button>
        <Button size="small" onClick={onOpenSettings} data-testid="acp-auth-banner-settings">
          {t('auth.openCliSettings')}
        </Button>
      </div>
    </div>
  )
})

AgentAuthBanner.displayName = 'AgentAuthBanner'

export default AgentAuthBanner
