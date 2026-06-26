import React, { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './AgentPanel.css'

interface AgentThinkingPlaceholderProps {
  agentName?: string
}

const AgentThinkingPlaceholder = memo(({ agentName }: AgentThinkingPlaceholderProps) => {
  const { t } = useTranslation('agent')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const label = elapsed >= 15
    ? t('status.thinkingVerySlow', { agent: agentName || t('panel.title'), seconds: elapsed })
    : elapsed >= 8
      ? t('status.thinkingSlow', { agent: agentName || t('panel.title'), seconds: elapsed })
      : t('status.thinking')

  return (
    <div className="agent-panel__thinking" data-testid="agent-thinking-placeholder" aria-live="polite">
      <span className="agent-panel__thinking-spinner" aria-hidden />
      <span className="agent-panel__thinking-label">{label}</span>
    </div>
  )
})

AgentThinkingPlaceholder.displayName = 'AgentThinkingPlaceholder'

export default AgentThinkingPlaceholder
