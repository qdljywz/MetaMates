import React, { memo, useCallback } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import ToolCallCard from './ToolCallCard'
import LazyMarkdownContent from './LazyMarkdownContent'
import { copyTextToClipboard } from '../../utils/clipboard'
import type { ChatAttachment } from './AgentChatInput'

export interface AgentMessage {
  id: string
  msg_id?: string
  type: string
  content: string
  position?: string
  status?: string
  title?: string
  toolCallId?: string
  kind?: string
  rawInput?: string
  toolFilePath?: string
  structuredContent?: unknown
  attachments?: ChatAttachment[]
  created_at?: number
}

export interface AgentMessageTheme {
  bg: string
  bgSecondary: string
  bgTertiary: string
  surface: string
  border: string
  text: string
  textSecondary: string
  primary: string
  primaryText: string
  primaryHover: string
  success: string
  warning: string
  error: string
  info: string
}

interface AgentMessageItemProps {
  msg: AgentMessage
  theme: AgentMessageTheme
  isDark: boolean
  workspacePath?: string
  renderMarkdown: (text: string) => string
  onOpenFile?: (filePath: string) => void
}

const AgentMessageItem = memo(({ msg, theme, isDark, workspacePath, renderMarkdown, onOpenFile }: AgentMessageItemProps) => {
  const { t } = useTranslation('agent')
  const handleCopy = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!msg.content) return
    const ok = await copyTextToClipboard(msg.content)
    if (ok) {
      message.success(t('message.copySuccess'))
    } else {
      message.error(t('message.copyFailed'))
    }
  }, [msg.content, t])

  const isUser = msg.type === 'user'
  const isStreaming = msg.type === 'agent' && msg.status === 'streaming'

  return (
    <div
      className={[
        'agent-panel__bubble',
        isUser ? 'agent-panel__bubble--user' : 'agent-panel__bubble--agent',
        isStreaming ? 'agent-panel__bubble--streaming' : '',
      ].filter(Boolean).join(' ')}
      data-testid={isUser ? 'user-message' : 'agent-message'}
      style={{
        marginBottom: 0,
        padding: msg.type === 'tool-call' ? 0 : undefined,
        background: msg.type === 'thinking' ? 'var(--canvas-elevated)' : msg.type === 'plan' ? 'var(--canvas-elevated)' : msg.type === 'tool-call' ? 'transparent' : undefined,
        border: msg.type === 'thinking' ? '1px solid var(--divider)' : msg.type === 'plan' ? '1px solid var(--divider)' : undefined,
        borderLeft: msg.type === 'thinking' ? `3px solid ${theme.warning}` : msg.type === 'plan' ? `3px solid ${theme.primary}` : undefined,
        position: 'relative',
        maxWidth: msg.type === 'tool-call' ? '100%' : undefined,
        alignSelf: msg.type === 'tool-call' || msg.type === 'thinking' || msg.type === 'plan' ? 'stretch' : undefined,
      }}
    >
      {msg.type !== 'user' && msg.content && (
        <button
          type="button"
          onClick={(event) => void handleCopy(event)}
          title={t('message.copy')}
          aria-label={t('message.copy')}
          className="agent-panel__copy-btn"
        >
          📋
        </button>
      )}
      {msg.type === 'tool-call' ? (
        <ToolCallCard
          title={msg.title}
          kind={msg.kind}
          status={msg.status}
          content={msg.content}
          rawInput={msg.rawInput}
          toolFilePath={msg.toolFilePath}
          structuredContent={msg.structuredContent}
          theme={theme}
          isDark={isDark}
          workspacePath={workspacePath}
          onOpenFile={onOpenFile}
        />
      ) : msg.type === 'thinking' ? (
        <div style={{ color: theme.textSecondary, fontStyle: 'italic' }}>💭 {msg.content}</div>
      ) : msg.type === 'plan' ? (
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: theme.primary }}>📋 {msg.title || t('modes.plan')}</div>
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            color: theme.textSecondary,
            fontFamily: 'inherit',
          }}>{msg.content}</pre>
        </div>
      ) : (
        <>
          {isUser && msg.attachments && msg.attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: msg.content ? 8 : 0 }}>
              {msg.attachments.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => onOpenFile?.(file.path)}
                  title={file.path}
                  style={{
                    border: '1px solid rgba(255,255,255,0.35)',
                    background: 'rgba(255,255,255,0.12)',
                    color: theme.primaryText,
                    borderRadius: 999,
                    padding: '2px 8px',
                    fontSize: 11,
                    cursor: onOpenFile ? 'pointer' : 'default',
                  }}
                >
                  📎 {file.name}
                </button>
              ))}
            </div>
          )}
          {msg.content && (
            isUser ? (
              <p className="agent-panel__bubble-text">{msg.content}</p>
            ) : (
              <LazyMarkdownContent
                content={msg.content}
                renderMarkdown={renderMarkdown}
                eager={isStreaming}
              />
            )
          )}
          {isUser && !msg.content && msg.attachments && msg.attachments.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.85 }}>{t('input.attachmentsOnly')}</div>
          )}
        </>
      )}
    </div>
  )
})

AgentMessageItem.displayName = 'AgentMessageItem'

export default AgentMessageItem
