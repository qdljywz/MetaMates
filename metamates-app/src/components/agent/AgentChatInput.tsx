import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { workspaceIndexService } from '../../services/workspaceIndex'
import { useSpeechRecognition, isElectronEnvironment } from '../../hooks/useSpeechRecognition'
import type { SpeechEnginePreference } from '../../utils/resolveSpeechBackend'
import { mergeVoiceTranscript } from '../../utils/voiceTranscript'
import './AgentPanel.css'
export interface ChatAttachment {
  path: string
  name: string
}

interface AgentChatInputProps {
  onSend: (text: string, attachments: ChatAttachment[]) => void
  onFocus?: () => void
  disabled: boolean
  placeholder: string
  workspacePath?: string
  currentFilePath?: string | null
  currentCommandBorder?: string
  canSubmitEmpty?: boolean
  speechEngine?: SpeechEnginePreference
}

const MAX_CONTEXT_CHARS = 8000

const AgentChatInput = memo(({
  onSend,
  onFocus,
  disabled,
  placeholder,
  workspacePath,
  currentFilePath,
  currentCommandBorder,
  canSubmitEmpty = false,
  speechEngine = 'auto',
}: AgentChatInputProps) => {
  const { t, i18n } = useTranslation('agent')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [fileCandidates, setFileCandidates] = useState<{ name: string; path: string }[]>([])
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voicePluginInstall, setVoicePluginInstall] = useState(false)
  const voicePrefixRef = useRef('')
  const voiceFinalRef = useRef('')
  const inputValueRef = useRef(inputValue)
  inputValueRef.current = inputValue

  useEffect(() => {
    const onPrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string; focus?: boolean }>).detail
      if (!detail?.text) return
      setInputValue(detail.text)
      voicePrefixRef.current = detail.text
      if (detail.focus !== false) {
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          const len = detail.text.length
          inputRef.current?.setSelectionRange(len, len)
        })
      }
    }
    window.addEventListener('metamates:prefill-agent', onPrefill)
    return () => window.removeEventListener('metamates:prefill-agent', onPrefill)
  }, [])

  const applyVoiceTranscript = useCallback((update: { final: string; interim: string }) => {
    const merged = mergeVoiceTranscript(voicePrefixRef.current, voiceFinalRef.current, update)
    voiceFinalRef.current = merged.accumulatedFinal
    setInputValue(merged.display)
  }, [])

  const resolveVoiceErrorKey = useCallback((code: string): string => {
    switch (code) {
      case 'not-allowed':
        return 'input.voiceDenied'
      case 'network':
        return isElectronEnvironment() ? 'input.voiceNetwork' : 'input.voiceError'
      case 'service-not-allowed':
        return 'input.voiceServiceBlocked'
      case 'no-speech':
        return 'input.voiceNoSpeech'
      case 'audio-capture':
        return 'input.voiceCapture'
      case 'start-failed':
        return 'input.voiceStartFailed'
      case 'native-failed':
        return 'input.voiceNativeFailed'
      case 'whisper-plugin':
        return 'input.voiceWhisperPlugin'
      case 'whisper-model':
        return 'input.voiceWhisperModel'
      case 'whisper-failed':
        return 'input.voiceWhisperFailed'
      default:
        return 'input.voiceError'
    }
  }, [])

  const { isListening, isSupported, start: startVoiceRecognition, stop: stopVoice } = useSpeechRecognition({
    language: i18n.language,
    enginePreference: speechEngine,
    onTranscript: applyVoiceTranscript,
    onError: (code) => {
      setVoicePluginInstall(code === 'whisper-plugin')
      setVoiceError(t(resolveVoiceErrorKey(code)))
    },
  })

  const handleVoiceClick = useCallback(() => {
    if (disabled) return
    if (!isSupported) {
      if (speechEngine === 'whisper') {
        setVoicePluginInstall(true)
        setVoiceError(t('input.voiceWhisperPlugin'))
      } else {
        setVoicePluginInstall(false)
        setVoiceError(t('input.voiceUnsupported'))
      }
      return
    }
    if (isListening) {
      stopVoice()
      return
    }
    setVoiceError(null)
    setVoicePluginInstall(false)
    setMentionQuery(null)
    voicePrefixRef.current = inputValue
    voiceFinalRef.current = ''
    void startVoiceRecognition()
  }, [disabled, inputValue, isListening, isSupported, speechEngine, startVoiceRecognition, stopVoice, t])

  useEffect(() => {
    if (!workspacePath) {
      setFileCandidates([])
      return
    }
    const files = workspaceIndexService.getAllFiles?.() || []
    setFileCandidates(files.map((file) => ({ name: file.name, path: file.path })))
  }, [workspacePath])

  useEffect(() => {
    const e2e = (window as Window & {
      __METAMATES_E2E__?: {
        enabled?: boolean
        registerSimulateVoiceTranscript?: (fn: ((text: string) => void) | null) => void
      }
    }).__METAMATES_E2E__
    if (!e2e?.enabled || !e2e.registerSimulateVoiceTranscript) return
    e2e.registerSimulateVoiceTranscript((text: string) => {
      voicePrefixRef.current = inputValueRef.current
      voiceFinalRef.current = ''
      applyVoiceTranscript({ final: text, interim: '' })
    })
    return () => {
      e2e.registerSimulateVoiceTranscript?.(null)
    }
  }, [applyVoiceTranscript])

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return []
    const query = mentionQuery.toLowerCase()
    return fileCandidates
      .filter((file) => file.name.toLowerCase().includes(query) || file.path.toLowerCase().includes(query))
      .slice(0, 8)
  }, [mentionQuery, fileCandidates])

  const addAttachment = useCallback((file: ChatAttachment) => {
    setAttachments((prev) => {
      if (prev.some((item) => item.path === file.path)) return prev
      return [...prev, file]
    })
  }, [])

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((item) => item.path !== path))
  }, [])

  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    setInputValue(value)
    if (isListening) {
      voicePrefixRef.current = value
      voiceFinalRef.current = ''
    }

    const cursor = event.target.selectionStart ?? value.length
    const beforeCursor = value.slice(0, cursor)
    const atMatch = beforeCursor.match(/@([\w\u4e00-\u9fa5./_-]*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }, [isListening])

  const pickMention = useCallback((file: { name: string; path: string }) => {
    const textarea = inputRef.current
    if (!textarea) return

    const cursor = textarea.selectionStart ?? inputValue.length
    const beforeCursor = inputValue.slice(0, cursor)
    const afterCursor = inputValue.slice(cursor)
    const atIndex = beforeCursor.lastIndexOf('@')
    if (atIndex === -1) return

    const nextValue = `${beforeCursor.slice(0, atIndex)}@${file.name} ${afterCursor}`
    setInputValue(nextValue)
    setMentionQuery(null)
    addAttachment({ path: file.path, name: file.name })
    textarea.focus()
  }, [inputValue, addAttachment])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const paths = [
      ...(event.dataTransfer.getData('application/x-metamates-path')
        ? [event.dataTransfer.getData('application/x-metamates-path')]
        : []),
      ...Array.from(event.dataTransfer.files)
        .map((file) => (file as File & { path?: string }).path)
        .filter(Boolean) as string[],
    ]

    for (const rawPath of paths) {
      if (!rawPath) continue
      const name = rawPath.split(/[/\\]/).pop() || rawPath
      addAttachment({ path: rawPath, name })
    }
  }, [addAttachment])

  const submit = useCallback(() => {
    if (!inputValue.trim() && attachments.length === 0 && !canSubmitEmpty) return
    if (disabled) return
    stopVoice()
    onSend(inputValue, attachments)
    setInputValue('')
    setAttachments([])
    setMentionQuery(null)
  }, [attachments, canSubmitEmpty, disabled, inputValue, onSend, stopVoice])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (mentionMatches.length > 0 && mentionQuery != null) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex((value) => (value + 1) % mentionMatches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((value) => (value - 1 + mentionMatches.length) % mentionMatches.length)
        return
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault()
        pickMention(mentionMatches[mentionIndex])
        return
      }
      if (event.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }, [mentionIndex, mentionMatches, mentionQuery, pickMention, submit])

  const currentFileName = currentFilePath?.split(/[/\\]/).pop()
  const canAttachCurrentFile = !!(
    currentFilePath &&
    currentFileName &&
    !currentFilePath.toLowerCase().endsWith('.pdf') &&
    !attachments.some((file) => file.path === currentFilePath)
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0 }}>
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attachments.map((file) => (
            <span key={file.path} className="agent-panel__context-file">
              📎 {file.name}
              <button
                type="button"
                onClick={() => removeAttachment(file.path)}
                aria-label={t('input.removeAttachment', { name: file.name })}
                style={{ marginLeft: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="agent-panel__input-row" style={{ position: 'relative' }}>
        <textarea
          ref={inputRef}
          data-testid="chat-input"
          className="agent-panel__input"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          style={currentCommandBorder ? { borderColor: currentCommandBorder } : undefined}
        />

        {mentionMatches.length > 0 && mentionQuery != null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 120,
              bottom: '100%',
              marginBottom: 6,
              background: 'var(--canvas-elevated)',
              border: '1px solid var(--divider-strong)',
              borderRadius: 8,
              overflow: 'hidden',
              zIndex: 20,
            }}
          >
            {mentionMatches.map((file, index) => (
              <button
                key={file.path}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  pickMention(file)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: index === mentionIndex ? 'var(--canvas-hover)' : 'transparent',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                @{file.name}
              </button>
            ))}
          </div>
        )}

        {canAttachCurrentFile && (
          <button
            type="button"
            className="agent-panel__attach"
            onClick={() => addAttachment({ path: currentFilePath!, name: currentFileName! })}
            disabled={disabled}
            title={t('input.attachCurrent', { name: currentFileName })}
            aria-label={t('input.attachCurrent', { name: currentFileName })}
          >
            <span className="agent-panel__attach-icon" aria-hidden>📎</span>
          </button>
        )}

        <button
          type="button"
          data-testid="voice-button"
          className={`agent-panel__voice${isListening ? ' agent-panel__voice--active' : ''}`}
          onClick={handleVoiceClick}
          disabled={disabled}
          title={isListening ? t('input.voiceStop') : t('input.voiceStart')}
          aria-label={isListening ? t('input.voiceStop') : t('input.voiceStart')}
          aria-pressed={isListening}
        >
          {isListening ? (
            <span className="agent-panel__voice-icon agent-panel__voice-icon--stop" aria-hidden />
          ) : (
            <span className="agent-panel__voice-icon" aria-hidden />
          )}
        </button>

        <button
          data-testid="send-button"
          className="agent-panel__send"
          onClick={submit}
          disabled={disabled || (!inputValue.trim() && attachments.length === 0 && !canSubmitEmpty)}
          aria-label={t('input.send')}
        >
          {t('input.send')}
        </button>
      </div>

      <div
        className={`agent-panel__input-hint${voiceError ? ' agent-panel__input-hint--error' : ''}`}
        data-testid="agent-input-hint"
        aria-live={voiceError ? 'assertive' : 'polite'}
        aria-atomic="true"
        role={voiceError ? 'alert' : undefined}
      >
        {voiceError ? (
          voicePluginInstall ? (
            <span>
              {voiceError}
              <Button
                type="link"
                size="small"
                data-testid="voice-install-extension"
                style={{ paddingInline: 6 }}
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('metamates:open-settings', {
                      detail: { tab: 'agent', focusPluginId: 'offline-speech' },
                    }),
                  )
                }}
              >
                {t('input.voiceInstallExtension')}
              </Button>
            </span>
          ) : (
            voiceError
          )
        ) : (
          (isListening ? t('input.voiceListening') : t('input.attachHint', { max: MAX_CONTEXT_CHARS }))
        )}
      </div>
    </div>
  )
})

AgentChatInput.displayName = 'AgentChatInput'

export default AgentChatInput

export async function buildAttachmentContext(
  attachments: ChatAttachment[],
  maxChars = MAX_CONTEXT_CHARS,
): Promise<{ context: string | null; truncated: boolean }> {
  if (!attachments.length || !window.electronAPI) {
    return { context: null, truncated: false }
  }

  const chunks: string[] = []
  let used = 0
  let truncated = false

  for (const file of attachments) {
    const result = await window.electronAPI.readFile(file.path)
    if (!result.success || !result.content) continue
    const header = `--- ${file.name} (${file.path}) ---`
    const budget = maxChars - used - header.length - 2
    if (budget <= 0) {
      truncated = true
      break
    }
    if (result.content.length > budget) truncated = true
    const body = result.content.slice(0, budget)
    chunks.push(`${header}\n${body}`)
    used += header.length + body.length + 2
  }

  return {
    context: chunks.length ? chunks.join('\n\n') : null,
    truncated,
  }
}
