import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import './AgentPanel.css'

interface AgentVaultContextProps {
  workspacePath?: string
  currentFile?: string | null
  agentName?: string
}

const AgentVaultContext = memo(({ workspacePath, currentFile, agentName }: AgentVaultContextProps) => {
  const { t } = useTranslation('agent')
  const fileName = currentFile?.split(/[/\\]/).pop()
  const workspaceName = workspacePath?.split(/[/\\]/).pop()

  return (
    <div className="agent-panel__context" data-testid="agent-vault-context">
      <p className="agent-panel__context-title">{t('panel.vaultReady')}</p>
      <p style={{ margin: 0 }}>
        {agentName
          ? t('panel.vaultHint', { agent: agentName })
          : t('panel.vaultHintGeneric')}
      </p>
      {workspaceName && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-dim)' }}>
          {t('panel.workspace')}: {workspaceName}
        </p>
      )}
      {fileName && (
        <span className="agent-panel__context-file">{t('panel.currentFile', { name: fileName })}</span>
      )}
    </div>
  )
})

AgentVaultContext.displayName = 'AgentVaultContext'

export default AgentVaultContext
