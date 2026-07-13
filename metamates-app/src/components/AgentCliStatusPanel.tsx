import React, { useCallback, useEffect, useState } from 'react'
import { Button, Card, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import type { AgentRuntimeSnapshot } from '../types/electron'

const { Text, Paragraph } = Typography

const BACKEND_LABELS: Record<string, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  codebuddy: 'CodeBuddy',
  codex: 'Codex',
}

function authMethodLabel(method: AgentRuntimeSnapshot['display']['authMethod'], t: (k: string) => string): string {
  switch (method) {
    case 'env':
      return t('settings.agentCliAuthEnv')
    case 'oauth':
      return t('settings.agentCliAuthOauth')
    case 'metamates-key':
      return t('settings.agentCliAuthMetamates')
    default:
      return t('settings.agentCliAuthMissing')
  }
}

function resolveAuthHint(
  runtime: AgentRuntimeSnapshot,
  label: string,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  if (runtime.display.authOk) return ''
  if (!runtime.cliInstalled) {
    return t('settings.agentCliAuthHintNotInstalled', { name: label })
  }
  if (runtime.backend === 'claude') return t('settings.agentCliAuthHintClaude')
  if (runtime.backend === 'gemini') return t('settings.agentCliAuthHintGemini')
  return runtime.display.authHint || t('settings.agentCliNeedsAuth')
}

const AgentCliStatusPanel: React.FC = () => {
  const { t } = useTranslation('common')
  const [runtimes, setRuntimes] = useState<AgentRuntimeSnapshot[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI?.acp.getAllAgentRuntimes?.()
      setRuntimes(list ?? [])
    } catch {
      setRuntimes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openClaudeLogin = useCallback(async () => {
    await window.electronAPI?.acp.openClaudeTerminalLogin?.()
  }, [])

  const openGeminiLogin = useCallback(async () => {
    await window.electronAPI?.acp.openGeminiTerminalLogin?.()
  }, [])

  if (runtimes.length === 0) {
    return (
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
        {t('settings.agentCliEmpty')}
      </Paragraph>
    )
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>{t('settings.agentCliTitle')}</Text>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>
          {t('settings.agentCliRefresh')}
        </Button>
      </div>
      {runtimes.map((runtime) => {
        const label = BACKEND_LABELS[runtime.backend] ?? runtime.backend
        const authOk = runtime.display.authOk
        const authHint = resolveAuthHint(runtime, label, t)
        return (
          <Card
            key={runtime.backend}
            size="small"
            data-testid={`agent-cli-status-${runtime.backend}`}
            title={label}
            extra={
              authOk
                ? <Tag color="success">{t('settings.agentCliConfigured')}</Tag>
                : <Tag color="warning">{t('settings.agentCliNeedsAuth')}</Tag>
            }
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {runtime.cliInstalled ? t('settings.agentCliInstalled') : t('settings.agentCliNotInstalled')}
              </Text>
              {runtime.display.effectiveModel && (
                <Text style={{ fontSize: 12 }}>
                  {t('settings.agentCliModel')}: <Text code>{runtime.display.effectiveModel}</Text>
                  {!runtime.capabilities.canSwitchModel && (
                    <Text type="secondary"> ({t('settings.agentCliModelLocked')})</Text>
                  )}
                </Text>
              )}
              {runtime.display.effectiveBaseUrl && (
                <Text style={{ fontSize: 12 }}>
                  {t('settings.agentCliBaseUrl')}: <Text code>{runtime.display.effectiveBaseUrl}</Text>
                </Text>
              )}
              <Text style={{ fontSize: 12 }}>
                {t('settings.agentCliAuth')}: {authMethodLabel(runtime.display.authMethod, t)}
              </Text>
              {!authOk && authHint && (
                <Paragraph type="warning" style={{ fontSize: 12, marginBottom: 0 }}>
                  {authHint}
                </Paragraph>
              )}
              {runtime.backend === 'claude' && (
                <Button size="small" onClick={() => void openClaudeLogin()}>
                  {t('settings.agentCliOpenClaudeLogin')}
                </Button>
              )}
              {runtime.backend === 'gemini' && !authOk && (
                <Button size="small" onClick={() => void openGeminiLogin()}>
                  {t('settings.agentCliOpenGeminiLogin')}
                </Button>
              )}
            </Space>
          </Card>
        )
      })}
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
        {t('settings.agentCliHint')}
      </Paragraph>
    </Space>
  )
}

export default AgentCliStatusPanel
