import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentSlashCommand } from '../../commands/agentSlashCommands'
import './AgentPanel.css'

interface AgentSlashBarProps {
  slashCommands: AgentSlashCommand[]
  currentCommand: AgentSlashCommand | null
  onCommandClick: (cmd: AgentSlashCommand) => void
  onClearCommand: () => void
  connected: boolean
  tCmd: (key: string) => string
}

const AgentSlashBar = memo(({
  slashCommands,
  currentCommand,
  onCommandClick,
  onClearCommand,
  connected,
  tCmd,
}: AgentSlashBarProps) => {
  const { t } = useTranslation('agent')

  return (
    <>
      <div className="agent-panel__command-slot">
        {currentCommand && (
          <div className="agent-panel__command-active">
            <span>/{currentCommand.name} — {tCmd(`commands.${currentCommand.name}.description`)}</span>
            <button type="button" onClick={onClearCommand} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>
              {t('actions.cancel')}
            </button>
          </div>
        )}
      </div>
      <div className="agent-panel__slash-bar" role="toolbar" aria-label={t('panel.slashCommands')}>
        {slashCommands.map((cmd) => (
          <button
            key={cmd.id}
            type="button"
            className={`agent-panel__slash-chip${currentCommand?.id === cmd.id ? ' agent-panel__slash-chip--active' : ''}`}
            data-testid={`slash-chip-${cmd.name}`}
            disabled={!connected}
            title={tCmd(`commands.${cmd.name}.description`)}
            onClick={() => onCommandClick(cmd)}
          >
            /{cmd.name}
          </button>
        ))}
      </div>
    </>
  )
})

AgentSlashBar.displayName = 'AgentSlashBar'

export default AgentSlashBar
