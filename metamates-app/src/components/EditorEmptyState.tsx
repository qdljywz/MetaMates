import React, { useEffect, useMemo } from 'react'
import { Button, Spin, Tag } from 'antd'
import {
  BulbOutlined,
  CloudDownloadOutlined,
  FolderOpenOutlined,
  MessageOutlined,
  ReloadOutlined,
  RocketOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../store/AppContext'
import { useEmptyStateDisplay } from '../hooks/useEmptyStatePlanner'
import { useWelcomeAgentHint } from '../hooks/useWelcomeAgentHint'
import {
  formatRecentFileLabel,
  type EmptyStateSuggestion,
} from '../utils/editorEmptyState'
import {
  focusAgentPanel,
  openCliInstall,
  openWorkspacePicker,
  prefillAgentPrompt,
  runSlashCommand,
} from '../utils/agentBridge'
import { recordEmptyStateShown } from '../utils/emptyStatePlanner'
import type { WelcomeAgentHint } from '../utils/welcomeContent'

function agentStatusLabel(hint: WelcomeAgentHint, t: (key: string) => string): string {
  switch (hint) {
    case 'ready':
      return t('emptyState.agentStatus.ready')
    case 'connecting':
      return t('emptyState.agentStatus.connecting')
    case 'auth_required':
      return t('emptyState.agentStatus.authRequired')
    case 'no_agent':
      return t('emptyState.agentStatus.noAgent')
    default:
      return t('emptyState.agentStatus.idle')
  }
}

function agentStatusColor(hint: WelcomeAgentHint): string {
  switch (hint) {
    case 'ready':
      return 'success'
    case 'connecting':
      return 'processing'
    case 'auth_required':
      return 'warning'
    case 'no_agent':
      return 'error'
    default:
      return 'default'
  }
}

function suggestionIcon(suggestion: EmptyStateSuggestion) {
  switch (suggestion.kind) {
    case 'open_workspace':
      return <FolderOpenOutlined />
    case 'open_settings':
      return <SettingOutlined />
    case 'install_agent':
      return <CloudDownloadOutlined />
    case 'slash':
      return <RocketOutlined />
    case 'open_file':
      return <BulbOutlined />
    default:
      return <MessageOutlined />
  }
}

function canPrefillAgent(hint: WelcomeAgentHint): boolean {
  return hint === 'ready' || hint === 'connecting' || hint === 'idle'
}

/**
 * Build compact, de-duplicated action cards for empty-state.
 * Deduplicates by rendered title to avoid visually repeated "continue: <same name>" cards.
 */
function buildCompactCards(
  suggestions: EmptyStateSuggestion[],
  primaryActionId: string | undefined,
  t: (key: string, options?: Record<string, string | number>) => string,
): EmptyStateSuggestion[] {
  const seenTitles = new Set<string>()
  const result: EmptyStateSuggestion[] = []
  for (const suggestion of suggestions) {
    if (suggestion.id === primaryActionId) continue
    const title = t(suggestion.titleKey)
    if (seenTitles.has(title)) continue
    seenTitles.add(title)
    result.push(suggestion)
    if (result.length >= 4) break
  }
  return result
}

const EditorEmptyState: React.FC = () => {
  const { t } = useTranslation('editor')
  const { state, dispatch } = useAppContext()
  const agentHint = useWelcomeAgentHint(state.workspacePath)
  const { context, snapshot, loading, refreshNow } = useEmptyStateDisplay(
    state.workspacePath,
    agentHint,
  )

  useEffect(() => {
    if (!snapshot?.questionId || !state.workspacePath) return
    void recordEmptyStateShown(state.workspacePath, snapshot.questionId)
  }, [snapshot?.questionId, state.workspacePath])

  const cards = useMemo(() => {
    if (!snapshot) return []
    return buildCompactCards(snapshot.suggestions, snapshot.primaryAction?.id, t)
  }, [snapshot, t])

  const openFile = (path: string) => {
    const name = path.split(/[/\\]/).pop() || path
    dispatch({
      type: 'ADD_TAB',
      payload: { path, name, isDirty: false },
    })
  }

  const handleSuggestion = (suggestion: EmptyStateSuggestion) => {
    switch (suggestion.kind) {
      case 'open_workspace':
        openWorkspacePicker()
        break
      case 'open_settings':
        window.dispatchEvent(new CustomEvent('metamates:open-settings'))
        focusAgentPanel()
        break
      case 'install_agent':
        openCliInstall()
        focusAgentPanel()
        break
      case 'focus_agent':
        focusAgentPanel()
        break
      case 'slash':
        if (suggestion.slash) {
          focusAgentPanel()
          if (suggestion.slash === 'graduate') {
            prefillAgentPrompt(t('emptyState.prefill.inboxGraduate'), true)
          }
          runSlashCommand(suggestion.slash, suggestion.slash === 'today' || suggestion.slash === 'closeday')
        }
        break
      case 'open_file':
        if (suggestion.path) openFile(suggestion.path)
        break
      default:
        focusAgentPanel()
    }
  }

  const handlePrimary = () => {
    if (!snapshot) return
    if (!context.hasWorkspace) {
      openWorkspacePicker()
      return
    }
    if (agentHint === 'no_agent') {
      openCliInstall()
      focusAgentPanel()
      return
    }
    if (agentHint === 'auth_required') {
      focusAgentPanel()
      return
    }
    const prefill = t(snapshot.prefillKey, snapshot.prefillParams)
    prefillAgentPrompt(prefill, true)
    focusAgentPanel()
  }

  const renderCardTitle = (suggestion: EmptyStateSuggestion) => {
    if (suggestion.kind === 'open_file' && suggestion.path) {
      const name = formatRecentFileLabel(
        suggestion.path.split(/[/\\]/).pop() || suggestion.path,
      )
      if (suggestion.id === 'open-today-plan') {
        return t(suggestion.titleKey)
      }
      return t(suggestion.titleKey, { name })
    }
    return t(suggestion.titleKey)
  }

  const renderCardDescription = (suggestion: EmptyStateSuggestion) => {
    if (suggestion.id === 'slash-graduate' && context.inboxCount > 0) {
      return t(suggestion.descriptionKey, { count: context.inboxCount })
    }
    return t(suggestion.descriptionKey)
  }

  const primaryLabel = !context.hasWorkspace
    ? t('emptyState.actions.openWorkspace.title')
    : agentHint === 'no_agent'
      ? t('emptyState.actions.installAgent.title')
      : agentHint === 'auth_required'
        ? t('emptyState.actions.authAgent.title')
        : t('emptyState.askAgent')

  return (
    <div className="editor-empty-state" data-testid="editor-empty-state">
      <div className="editor-empty-state__inner">
        <div className="editor-empty-state__header">
          <p className="editor-empty-state__eyebrow">{t('emptyState.eyebrow')}</p>
          {loading || !snapshot ? (
            <div className="editor-empty-state__loading">
              <Spin />
            </div>
          ) : (
            <>
              <h1
                className="editor-empty-state__title"
                data-testid="editor-empty-state-question"
              >
                {snapshot.questionText || t(snapshot.questionKey, snapshot.questionParams)}
              </h1>
              {(snapshot.contextLineText || snapshot.contextLineKey) && (
                <p className="editor-empty-state__context-line">
                  {snapshot.contextLineText || t(snapshot.contextLineKey!, snapshot.contextLineParams)}
                </p>
              )}
              {context.hasWorkspace && (
                <Tag color={agentStatusColor(agentHint)} className="editor-empty-state__agent-tag">
                  {agentStatusLabel(agentHint, t)}
                </Tag>
              )}
            </>
          )}
        </div>

        {!loading && snapshot && (
          <>
            <Button
              type="primary"
              size="large"
              className="editor-empty-state__primary"
              data-testid="editor-empty-state-primary"
              icon={canPrefillAgent(agentHint) ? <MessageOutlined /> : suggestionIcon(snapshot.primaryAction!)}
              onClick={handlePrimary}
            >
              {primaryLabel}
            </Button>

            {cards.length > 0 && (
              <div className="editor-empty-state__grid">
                {cards.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="editor-empty-state__card"
                    onClick={() => handleSuggestion(suggestion)}
                  >
                    <span className="editor-empty-state__card-icon">{suggestionIcon(suggestion)}</span>
                    <span className="editor-empty-state__card-title">{renderCardTitle(suggestion)}</span>
                    <span className="editor-empty-state__card-desc">{renderCardDescription(suggestion)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="editor-empty-state__footer-row">
              <p className="editor-empty-state__hint">{t('emptyState.footerHint')}</p>
              {context.hasWorkspace && (
                <button
                  type="button"
                  className="editor-empty-state__refresh"
                  onClick={refreshNow}
                >
                  <ReloadOutlined /> {t('emptyState.refreshQuestion')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default EditorEmptyState
