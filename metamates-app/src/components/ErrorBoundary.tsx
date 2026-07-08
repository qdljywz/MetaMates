import React, { Component, ErrorInfo, ReactNode, useState } from 'react'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const ErrorFallback: React.FC<{ error: Error | null }> = ({ error }) => {
  const { t } = useTranslation('common')
  const [showDetails, setShowDetails] = useState(false)

  const handleReload = () => {
    window.location.reload()
  }

  const handleCopyDetails = async () => {
    const text = [error?.message, error?.stack].filter(Boolean).join('\n\n')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <div
      style={{
        padding: 24,
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        background: 'var(--canvas-surface)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{t('errorBoundary.title')}</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t('errorBoundary.hint')}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button type="primary" onClick={handleReload}>
            {t('errorBoundary.reload')}
          </Button>
          <Button onClick={() => setShowDetails((prev) => !prev)}>
            {showDetails ? t('errorBoundary.hideDetails') : t('errorBoundary.showDetails')}
          </Button>
          {showDetails && (
            <Button onClick={() => void handleCopyDetails()}>
              {t('errorBoundary.copyDetails')}
            </Button>
          )}
        </div>
        {showDetails && (
          <pre
            style={{
              marginTop: 20,
              padding: 12,
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 11,
              lineHeight: 1.5,
              borderRadius: 8,
              background: 'var(--canvas-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--divider)',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {error?.stack || error?.message || t('errorBoundary.noDetails')}
          </pre>
        )}
      </div>
    </div>
  )
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />
    }

    return this.props.children
  }
}

export default ErrorBoundary
