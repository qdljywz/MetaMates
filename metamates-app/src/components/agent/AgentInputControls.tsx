import React, { memo } from 'react'

import { useTranslation } from 'react-i18next'

import type { AgentConnStatus } from '../../utils/agentConnectionStatus'
import { deriveAgentSessionPillKey } from '../../utils/agentSessionPill'

import './AgentPanel.css'

interface AgentInputControlsProps {
  connectionStatus: AgentConnStatus
  isStreaming: boolean
  hasInProgressTools?: boolean
  warmupPhase?: 'idle' | 'preparing' | 'ready' | 'error'
  models: Array<{ id: string; name: string }>
  selectedModel: string
  modelReadOnly?: boolean
  modelProvenance?: string | null
  onModelChange: (modelId: string) => void
  onStop?: () => void
}

const AgentInputControls = memo(({
  connectionStatus,
  isStreaming,
  hasInProgressTools = false,
  warmupPhase = 'idle',
  models,
  selectedModel,
  modelReadOnly = false,
  modelProvenance = null,
  onModelChange,
  onStop,
}: AgentInputControlsProps) => {
  const { t } = useTranslation('agent')

  const pillKey = deriveAgentSessionPillKey({
    connectionStatus,
    isStreaming,
    hasInProgressTools,
    warmupPhase,
  })

  const pill = React.useMemo(() => {
    switch (pillKey) {
      case 'streaming':
        return { text: t('session.streaming'), className: 'agent-panel__pill agent-panel__pill--streaming' }
      case 'toolRunning':
        return { text: t('session.toolRunning'), className: 'agent-panel__pill agent-panel__pill--streaming' }
      case 'standby':
        return { text: t('session.standby'), className: 'agent-panel__pill agent-panel__pill--active' }
      case 'connecting':
        return { text: t('sidebar.connecting'), className: 'agent-panel__pill agent-panel__pill--connecting' }
      case 'authRequired':
        return { text: t('status.authRequired'), className: 'agent-panel__pill agent-panel__pill--connecting' }
      case 'error':
        return { text: t('session.error'), className: 'agent-panel__pill agent-panel__pill--error' }
      default:
        return { text: t('session.ready'), className: 'agent-panel__pill agent-panel__pill--idle' }
    }
  }, [pillKey, t])

  const showModel = connectionStatus === 'connected' && (models.length > 0 || (modelReadOnly && selectedModel))
  const showConnectingPlaceholder = (warmupPhase === 'preparing' || connectionStatus === 'connecting') && !showModel

  return (
    <div className="agent-panel__input-controls">
      <span
        data-testid="acp-connection-status"
        data-status={connectionStatus}
        data-session-pill={pillKey}
        className={pill.className}
        role="status"
        aria-live="polite"
      >
        {pill.text}
      </span>

      {(isStreaming || hasInProgressTools) && onStop && (
        <button type="button" className="agent-panel__stop agent-panel__stop--compact" data-testid="cancel-prompt" onClick={onStop}>
          {t('actions.stop')}
        </button>
      )}

      {showModel ? (
        modelReadOnly ? (
          <span
            className="agent-panel__select agent-panel__select--compact agent-panel__select--readonly"
            data-testid="acp-model-readonly"
            title={modelProvenance || t('session.modelFromCli')}
            aria-label={t('session.model')}
          >
            {selectedModel || models[0]?.name || '…'}
          </span>
        ) : (
          <select
            className="agent-panel__select agent-panel__select--compact"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            aria-label={t('session.model')}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
        )
      ) : showConnectingPlaceholder ? (
        <span className="agent-panel__select agent-panel__select--compact agent-panel__select--placeholder" aria-hidden>
          …
        </span>
      ) : null}
    </div>
  )
})

AgentInputControls.displayName = 'AgentInputControls'

export default AgentInputControls
