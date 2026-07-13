import React, { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ToolDiffStats } from '../../services/agent-bridge/parseToolDiff'

export interface ToolCallDiffViewProps {
  diff: ToolDiffStats
  theme: {
    surface: string
    border: string
    text: string
    textSecondary: string
    success: string
    error: string
    info: string
  }
  isDark: boolean
}

const ToolCallDiffView = memo(({ diff, theme, isDark }: ToolCallDiffViewProps) => {
  const { t } = useTranslation('agent')
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ borderTop: `1px solid ${theme.border}` }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          border: 'none',
          background: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.02)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span className="agent-tool-call__diff-label">
          {t('toolCall.diffTitle', { file: diff.fileName })}
        </span>
        {diff.insertions > 0 && (
          <span style={{ color: theme.success, fontSize: 11 }}>+{diff.insertions}</span>
        )}
        {diff.deletions > 0 && (
          <span style={{ color: theme.error, fontSize: 11 }}>-{diff.deletions}</span>
        )}
        <span style={{ marginLeft: 'auto', color: theme.textSecondary, fontSize: 11 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <pre
          style={{
            margin: 0,
            padding: '10px 12px',
            maxHeight: 280,
            overflow: 'auto',
            fontSize: 11,
            lineHeight: 1.45,
            background: isDark ? '#111827' : '#f8fafc',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {diff.unifiedDiff.split('\n').map((line, index) => {
            let color = theme.textSecondary
            if (line.startsWith('+') && !line.startsWith('+++')) color = theme.success
            else if (line.startsWith('-') && !line.startsWith('---')) color = theme.error
            else if (line.startsWith('@@')) color = theme.info
            return (
              <div key={index} style={{ color }}>
                {line}
              </div>
            )
          })}
        </pre>
      )}
    </div>
  )
})

ToolCallDiffView.displayName = 'ToolCallDiffView'

export default ToolCallDiffView
