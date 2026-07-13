import React, { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { inferToolCallKind, extractToolCallFilePath, extractLineNumberFromToolText, type ToolCallKind } from '../../services/agent-bridge/composeChatBubble'
import { extractAllFilePathsFromToolText } from '../../services/agent-bridge/mergeChatBubble'
import { formatToolDisplayTitle } from '../../utils/toolCallStatus'
import { isPathInsideWorkspace } from '../../constants/paths'
import { extractToolDiff } from '../../services/agent-bridge/parseToolDiff'
import ToolCallDiffView from './ToolCallDiffView'

export interface ToolCallCardProps {
  title?: string
  kind?: string
  status?: string
  content?: string
  rawInput?: string
  toolFilePath?: string
  structuredContent?: unknown
  theme: {
    surface: string
    border: string
    text: string
    textSecondary: string
    primary: string
    success: string
    warning: string
    error: string
    info: string
  }
  isDark: boolean
  workspacePath?: string
  onOpenFile?: (filePath: string, line?: number) => void
}

const KIND_ICON: Record<ToolCallKind, string> = {
  read: '📖',
  edit: '✏️',
  execute: '⚡',
  search: '🔍',
  unknown: '🔧',
}

const STATUS_I18N: Record<string, string> = {
  in_progress: 'toolCall.status.inProgress',
  pending: 'toolCall.status.inProgress',
  completed: 'toolCall.status.completed',
  failed: 'toolCall.status.failed',
  error: 'toolCall.status.failed',
}

const ToolCallCard = memo(({
  title,
  kind,
  status,
  content,
  rawInput,
  toolFilePath,
  structuredContent,
  theme,
  isDark,
  workspacePath,
  onOpenFile,
}: ToolCallCardProps) => {
  const { t } = useTranslation('agent')
  const resolvedKind = inferToolCallKind(title, kind)
  const statusKey = status ? STATUS_I18N[status] : undefined
  const statusLabel = statusKey ? t(statusKey) : (status || '')
  const pathHaystack = `${title || ''} ${content || ''} ${rawInput || ''}`
  const filePath = useMemo(() => {
    if (toolFilePath?.trim()) return toolFilePath.trim()
    return extractToolCallFilePath({
      title,
      kind: resolvedKind,
      content,
      rawInput,
      structuredContent,
    }, { allowTextFallback: false })
  }, [title, resolvedKind, content, rawInput, structuredContent, toolFilePath])
  const fileLine = useMemo(
    () => extractLineNumberFromToolText(pathHaystack) ?? undefined,
    [pathHaystack],
  )
  const canOpenInVault = Boolean(
    workspacePath
    && filePath
    && (resolvedKind === 'read' || resolvedKind === 'edit')
    && isPathInsideWorkspace(workspacePath, filePath)
  )
  const outsideVaultPaths = useMemo(() => {
    if (!workspacePath) return []
    const haystack = `${rawInput || ''}\n${content || ''}`
    return extractAllFilePathsFromToolText(haystack).filter(
      (candidate) => !isPathInsideWorkspace(workspacePath, candidate)
    )
  }, [workspacePath, rawInput, content])

  const statusColor =
    status === 'completed' ? theme.success :
    status === 'failed' || status === 'error' ? theme.error :
    theme.warning

  const statusBg = isDark
    ? `${statusColor}33`
    : `${statusColor}22`

  const kindLabel = t(`toolCall.kind.${resolvedKind}`, { defaultValue: title || t('toolCall.kind.unknown') })
  const displayTitle = formatToolDisplayTitle(title, filePath ?? undefined, kindLabel)
  const fullTitle = title || (filePath ? `${kindLabel} ${filePath}` : kindLabel)
  const showRawInput = Boolean(rawInput) && !(resolvedKind === 'read' && filePath)
  const diff = useMemo(
    () => (resolvedKind === 'edit' ? extractToolDiff(rawInput, content) : null),
    [resolvedKind, rawInput, content]
  )

  return (
    <div
      style={{
        fontSize: 13,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: theme.surface,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: (showRawInput && rawInput) || content ? `1px solid ${theme.border}` : undefined,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 16 }}>{KIND_ICON[resolvedKind]}</span>
        <span
          className="agent-tool-call__title"
          style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
          title={fullTitle}
        >
          {displayTitle}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: statusBg,
            color: statusColor,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel}
        </span>
        {canOpenInVault && onOpenFile && (
          <button
            type="button"
                onClick={() => onOpenFile(filePath!, fileLine)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.primary,
              cursor: 'pointer',
            }}
          >
            {t('toolCall.openFile')}
          </button>
        )}
      </div>

      {outsideVaultPaths.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 11,
            color: theme.warning,
            background: isDark ? 'rgba(255,180,0,0.12)' : 'rgba(255,180,0,0.08)',
            borderBottom: (showRawInput && rawInput) || content ? `1px solid ${theme.border}` : undefined,
          }}
        >
          {t('toolCall.outsideWorkspaceHint', { path: outsideVaultPaths[0] })}
        </div>
      )}

      {showRawInput && rawInput && (
        <pre
          style={{
            margin: 0,
            padding: '10px 12px',
            fontSize: 11,
            lineHeight: 1.5,
            color: theme.textSecondary,
            background: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.03)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            borderBottom: content ? `1px solid ${theme.border}` : undefined,
          }}
        >
          {rawInput}
        </pre>
      )}

      {diff && (
        <ToolCallDiffView diff={diff} theme={theme} isDark={isDark} />
      )}

      {content && content !== title && !diff && (
        <div
          style={{
            padding: '10px 12px',
            color: theme.textSecondary,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
})

ToolCallCard.displayName = 'ToolCallCard'

export default ToolCallCard
