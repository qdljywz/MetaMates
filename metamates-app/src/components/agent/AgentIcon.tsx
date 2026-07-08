import React, { memo, useState } from 'react'
import { getAgentColor, getAgentInitial } from '../../utils/agentLogo'

export interface AgentIconAgent {
  backend: string
  name: string
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

interface AgentIconProps {
  agent: AgentIconAgent
  size?: number
}

const AgentIcon = memo(({ agent, size = 28 }: AgentIconProps) => {
  const [fileFailed, setFileFailed] = useState(false)

  if (agent.logo?.type === 'file' && agent.logo.src && !fileFailed) {
    return (
      <img
        src={agent.logo.src}
        alt={agent.name}
        onError={() => setFileFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
      />
    )
  }

  const bgColor = agent.logo?.bgColor || getAgentColor(agent.backend)
  const initial = agent.logo?.initial || getAgentInitial(agent.backend, agent.name)

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: Math.max(10, Math.round(size * 0.42)),
        fontWeight: 700,
        color: '#fff',
        background: bgColor,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  )
})

AgentIcon.displayName = 'AgentIcon'

export default AgentIcon
