import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import AgentIcon, { type AgentIconAgent } from './AgentIcon'
import { useEngineName } from '../../hooks/useEngineName'
import type { AgentConnStatus } from '../../utils/agentConnectionStatus'
import './AgentPanel.css'

interface AgentToolbarProps {
  agents: AgentIconAgent[]
  currentBackend: string | null
  agentStatus: Map<string, AgentConnStatus>
  warmupPhase?: 'idle' | 'preparing' | 'ready' | 'error'
  onSelectAgent: (backend: string) => void
}

function statusDotClass(status: AgentConnStatus): string {
  switch (status) {
    case 'connected': return 'var(--success)'
    case 'connecting': return 'var(--warning)'
    case 'auth_required': return 'var(--warning)'
    case 'error': return 'var(--error)'
    default: return 'var(--text-dim)'
  }
}

function statusDotModifier(status: AgentConnStatus): string {
  if (status === 'connecting') return ' agent-panel__status-dot--connecting'
  if (status === 'disconnected') return ' agent-panel__status-dot--disconnected'
  return ''
}

function statusLabel(status: AgentConnStatus, t: (key: string) => string): string {
  switch (status) {
    case 'connected': return t('session.active')
    case 'connecting': return t('sidebar.connecting')
    case 'auth_required': return t('status.authRequired')
    case 'error': return t('session.error')
    default: return t('session.inactive')
  }
}

const AgentToolbar = memo(({
  agents,
  currentBackend,
  agentStatus,
  warmupPhase = 'idle',
  onSelectAgent,
}: AgentToolbarProps) => {
  const { t } = useTranslation('agent')
  const { displayName: partnerName } = useEngineName()

  if (agents.length === 0) return null

  return (
    <header className="agent-panel__toolbar agent-panel__toolbar--slim" data-testid="agent-toolbar">
      <div className="agent-panel__toolbar-row">
        <span
          className="agent-panel__label agent-panel__label--partner"
          title={partnerName}
        >
          {partnerName}
        </span>
        <div className="agent-panel__agents">
          {agents.map((agent) => {
            const status = agentStatus.get(agent.backend) || 'disconnected'
            const isActive = currentBackend === agent.backend
            const isWarming = isActive && (status === 'connecting' || warmupPhase === 'preparing')
            return (
              <button
                key={agent.backend}
                type="button"
                data-testid={`agent-sidebar-${agent.backend}`}
                className={[
                  'agent-panel__agent-btn',
                  isActive ? 'agent-panel__agent-btn--active' : '',
                  isWarming ? 'agent-panel__agent-btn--warming' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSelectAgent(agent.backend)}
                aria-label={`${agent.name} — ${statusLabel(status, t)}`}
                aria-pressed={isActive}
                title={`${agent.name} — ${statusLabel(status, t)}`}
              >
                <AgentIcon agent={agent} size={22} />
                <span
                  className={`agent-panel__status-dot${statusDotModifier(status)}`}
                  style={{ background: statusDotClass(status) }}
                />
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
})

AgentToolbar.displayName = 'AgentToolbar'

export default AgentToolbar
