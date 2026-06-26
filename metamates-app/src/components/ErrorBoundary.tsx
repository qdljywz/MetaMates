import React, { Component, ErrorInfo, ReactNode } from 'react'
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
  return (
    <div style={{ padding: 20, color: '#f38ba8', background: '#1e1e2e', height: '100%', overflow: 'auto' }}>
      <h2 style={{ color: '#cdd6f4' }}>{t('errorBoundary.title')}</h2>
      <p style={{ color: '#a6adc8', marginBottom: 16 }}>{t('errorBoundary.hint')}</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#f38ba8' }}>
        {error?.toString()}
      </pre>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 20, color: '#6c7086', fontSize: 12 }}>
        {error?.stack}
      </pre>
    </div>
  )
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
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
