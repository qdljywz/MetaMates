import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'

interface AgentConnectingSkeletonProps {
  agentName?: string
  /** i18n key under agent.* — defaults to status.connecting */
  labelKey?: string
}

/** Lightweight placeholder while CLI session warms up — avoids a blank panel. */
const AgentConnectingSkeleton = memo(({ agentName, labelKey = 'status.connecting' }: AgentConnectingSkeletonProps) => {
  const { t } = useTranslation('agent')

  return (
    <div className="agent-panel__connecting" data-testid="agent-connecting-skeleton">
      <div className="agent-panel__connecting-spinner" aria-hidden />
      <p className="agent-panel__connecting-label">
        {t(labelKey, { name: agentName || '…' })}
      </p>
      <div className="agent-panel__skeleton-lines" aria-hidden>
        <span className="agent-panel__skeleton-line agent-panel__skeleton-line--wide" />
        <span className="agent-panel__skeleton-line agent-panel__skeleton-line--medium" />
        <span className="agent-panel__skeleton-line agent-panel__skeleton-line--short" />
      </div>
    </div>
  )
})

AgentConnectingSkeleton.displayName = 'AgentConnectingSkeleton'

export default AgentConnectingSkeleton
