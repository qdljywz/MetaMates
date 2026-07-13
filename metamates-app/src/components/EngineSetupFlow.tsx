import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Steps, Button, Typography, Tag, Spin, message, Radio, Space } from 'antd'
import { CheckCircleOutlined, RobotOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ACP_BACKENDS, type AcpBackend } from '../services/agent-bridge/acpTypes'
import { cliInstaller } from '../services/agent-bridge/installer'
import { storageService } from '../services/storage'
import AgentIcon from './agent/AgentIcon'
import { getAgentLogoInfo } from '../utils/agentLogo'
import {
  ENGINE_SETUP_BACKENDS,
  buildCliEnabledPatch,
  engineSetupReadyPatch,
  engineSetupVaultOnlyPatch,
  getRecommendedEngineBackend,
  isEngineSetupBackend,
  type EngineSetupBackendId,
} from '../utils/engineSetupPolicy'
import {
  connectEngineBackend,
  detectBackendAuthOk,
} from '../utils/engineSetupDetect'
import './EngineSetupFlow.css'

const { Paragraph, Text } = Typography

type FlowStep = 0 | 1 | 2 | 3

interface EngineSetupFlowProps {
  visible: boolean
  workspacePath?: string
  onComplete: (result: 'ready' | 'vault_only') => void
}

const EngineSetupFlow: React.FC<EngineSetupFlowProps> = ({
  visible,
  workspacePath,
  onComplete,
}) => {
  const { t, i18n } = useTranslation('engineSetup')
  const recommended = getRecommendedEngineBackend(i18n.language)
  const [step, setStep] = useState<FlowStep>(0)
  const [selected, setSelected] = useState<EngineSetupBackendId>(recommended)
  const [showOthers, setShowOthers] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<string | null>(null)
  const [authOk, setAuthOk] = useState(false)
  const [authChecking, setAuthChecking] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)

  const config = ACP_BACKENDS[selected as AcpBackend]
  const assistantName = config?.name || selected

  const otherBackends = useMemo(
    () => ENGINE_SETUP_BACKENDS.filter((b) => b !== recommended),
    [recommended],
  )

  const refreshInstallStatus = useCallback(async (backend: EngineSetupBackendId) => {
    const ok = await cliInstaller.checkInstallation(backend as AcpBackend)
    setInstalled(ok)
    return ok
  }, [])

  const refreshAuth = useCallback(async (backend: EngineSetupBackendId) => {
    setAuthChecking(true)
    try {
      const ok = await detectBackendAuthOk(backend)
      setAuthOk(ok)
      return ok
    } finally {
      setAuthChecking(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    setStep(0)
    setSelected(recommended)
    setShowOthers(false)
    setInstallError(null)
    setInstallProgress(null)
    setConnected(false)
    void refreshInstallStatus(recommended)
  }, [visible, recommended, refreshInstallStatus])

  useEffect(() => {
    if (!visible || step < 1) return
    void refreshInstallStatus(selected)
  }, [visible, step, selected, refreshInstallStatus])

  useEffect(() => {
    if (!visible || step !== 2) return
    void refreshAuth(selected)
  }, [visible, step, selected, refreshAuth])

  useEffect(() => {
    if (!visible) return
    const unsub = cliInstaller.onInstallProgress((backend, progress) => {
      if (backend !== selected) return
      setInstallProgress(progress.message)
      if (progress.stage === 'completed') {
        setInstalling(false)
        setInstalled(true)
      }
      if (progress.stage === 'error') {
        setInstalling(false)
        setInstallError(progress.message)
      }
    })
    return unsub
  }, [visible, selected])

  const enableAssistant = async (backend: string) => {
    const settings = await storageService.getSettings()
    const cliAgentEnabled = buildCliEnabledPatch(backend, settings.cliAgentEnabled)
    await storageService.saveSettings({
      cliAgentEnabled,
      preferredAssistant: backend,
      lastAgentBackend: backend,
    })
    if (window.electronAPI?.acp?.setCliAgentEnabled) {
      for (const key of Object.keys(cliAgentEnabled)) {
        await window.electronAPI.acp.setCliAgentEnabled(key, cliAgentEnabled[key] !== false)
      }
    }
    await window.electronAPI?.acp?.refreshAgents?.()
  }

  const handleInstall = async () => {
    if (!window.electronAPI) {
      message.error(t('errors.noElectron'))
      return
    }
    setInstalling(true)
    setInstallError(null)
    const result = await cliInstaller.installCli(selected as AcpBackend)
    setInstalling(false)
    if (result.success) {
      setInstalled(true)
      await enableAssistant(selected)
      message.success(t('install.installed'))
    } else {
      setInstallError(result.error || t('install.failed'))
    }
  }

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await enableAssistant(selected)
      const ok = await connectEngineBackend(selected)
      setConnected(ok)
      if (ok) {
        await refreshAuth(selected)
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleFinishReady = async () => {
    await enableAssistant(selected)
    if (!connected) {
      await connectEngineBackend(selected)
    }
    const patch = engineSetupReadyPatch(selected)
    await storageService.saveSettings({
      ...patch,
      lastAgentBackend: selected,
    })
    if (window.electronAPI?.saveSettings) {
      await window.electronAPI.saveSettings({
        ...patch,
        lastAgentBackend: selected,
      })
    }
    if (workspacePath && window.electronAPI?.acp?.setWorkspacePath) {
      await window.electronAPI.acp.setWorkspacePath(workspacePath)
    }
    await window.electronAPI?.acp?.refreshAgents?.()
    window.dispatchEvent(new CustomEvent('metamates:engine-setup-complete'))
    onComplete('ready')
  }

  const handleVaultOnly = async () => {
    const patch = engineSetupVaultOnlyPatch()
    await storageService.saveSettings(patch)
    if (window.electronAPI?.saveSettings) {
      await window.electronAPI.saveSettings(patch)
    }
    onComplete('vault_only')
  }

  const goNext = async () => {
    if (step === 0) {
      setStep(1)
      return
    }
    if (step === 1) {
      if (!installed) {
        message.warning(t('install.notInstalled'))
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      if (!connected) {
        await handleConnect()
      }
      setStep(3)
    }
  }

  const renderPickStep = () => (
    <div className="engine-setup__pick">
      <Paragraph type="secondary">{t('pick.hint')}</Paragraph>
      <div
        className={`engine-setup__card engine-setup__card--recommended${selected === recommended ? ' engine-setup__card--selected' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setSelected(recommended)}
        onKeyDown={(e) => e.key === 'Enter' && setSelected(recommended)}
        data-testid={`engine-setup-pick-${recommended}`}
      >
        <Space align="start">
          <AgentIcon
            agent={{
              backend: recommended,
              name: ACP_BACKENDS[recommended]?.name || recommended,
              logo: getAgentLogoInfo(recommended),
            }}
            size={36}
          />
          <div>
            <div className="engine-setup__card-title">
              {ACP_BACKENDS[recommended]?.name}
              <Tag className="mm-tag mm-tag--accent" style={{ marginLeft: 8 }}>{t('pick.recommended')}</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {i18n.t(`cli:backendDesc.${recommended}`, { defaultValue: ACP_BACKENDS[recommended]?.description })}
            </Text>
          </div>
        </Space>
      </div>

      <Button type="link" size="small" onClick={() => setShowOthers((v) => !v)} style={{ paddingLeft: 0 }}>
        {t('pick.others')} {showOthers ? '▴' : '▾'}
      </Button>

      {showOthers && (
        <Radio.Group
          value={selected}
          onChange={(e) => {
            const v = e.target.value as string
            if (isEngineSetupBackend(v)) setSelected(v)
          }}
          className="engine-setup__others"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {otherBackends.map((backend) => (
              <Radio key={backend} value={backend} data-testid={`engine-setup-pick-${backend}`}>
                {ACP_BACKENDS[backend]?.name}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      )}
    </div>
  )

  const renderInstallStep = () => (
    <div className="engine-setup__install">
      <Paragraph>{t('install.hint')}</Paragraph>
      <Paragraph>
        <Text strong>{t('install.title', { name: assistantName })}</Text>
        <br />
        <Text type={installed ? 'success' : 'secondary'}>
          {installing ? t('install.installing') : installed ? t('install.installed') : t('install.notInstalled')}
        </Text>
      </Paragraph>
      {installProgress && installing && (
        <Paragraph type="secondary" style={{ fontSize: 12 }}>{installProgress}</Paragraph>
      )}
      {installError && (
        <Paragraph type="danger" style={{ fontSize: 12 }}>{installError}</Paragraph>
      )}
      <Button
        type="primary"
        loading={installing}
        disabled={installed && !installError}
        onClick={() => void handleInstall()}
        data-testid="engine-setup-install"
      >
        {installed && !installError ? t('install.installed') : t('install.button', { name: assistantName })}
      </Button>
      {installError && (
        <Button style={{ marginLeft: 8 }} onClick={() => void handleInstall()}>
          {t('install.retry')}
        </Button>
      )}
    </div>
  )

  const renderAuthStep = () => (
    <div className="engine-setup__auth">
      <Paragraph>{t('auth.hint')}</Paragraph>
      {authChecking ? (
        <Spin tip={t('auth.checking')} />
      ) : authOk ? (
        <Paragraph type="success">{t('auth.ready')}</Paragraph>
      ) : (
        <Paragraph type="warning">{t('auth.needsAuth')}</Paragraph>
      )}
      {selected === 'claude' && (
        <Button
          size="small"
          onClick={() => void window.electronAPI?.acp?.openClaudeTerminalLogin?.()}
        >
          {t('auth.openClaudeLogin')}
        </Button>
      )}
      {selected === 'gemini' && (
        <Button
          size="small"
          onClick={() => void window.electronAPI?.acp?.openGeminiTerminalLogin?.()}
        >
          {t('auth.openGeminiLogin')}
        </Button>
      )}
      {selected === 'codebuddy' && (
        <Paragraph type="secondary" style={{ fontSize: 12 }}>{t('auth.codebuddyHint')}</Paragraph>
      )}
      {selected === 'codex' && (
        <Paragraph type="secondary" style={{ fontSize: 12 }}>{t('auth.codexHint', { defaultValue: t('auth.codebuddyHint') })}</Paragraph>
      )}
      <div style={{ marginTop: 12 }}>
        <Button size="small" onClick={() => void refreshAuth(selected)}>{t('auth.rescan')}</Button>
        <Button
          type="primary"
          size="small"
          style={{ marginLeft: 8 }}
          loading={connecting}
          onClick={() => void handleConnect()}
          data-testid="engine-setup-connect"
        >
          {connected ? t('auth.connected', { name: assistantName }) : t('auth.connecting')}
        </Button>
      </div>
    </div>
  )

  const renderDoneStep = () => (
    <div className="engine-setup__done">
      <CheckCircleOutlined style={{ fontSize: 48, color: 'var(--success, #52c41a)' }} />
      <Paragraph style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>{t('done.title')}</Paragraph>
      <Paragraph type="secondary">{t('done.subtitle')}</Paragraph>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>{t('done.firstMessageHint')}</Paragraph>
    </div>
  )

  const stepItems = [
    { title: t('steps.pick') },
    { title: t('steps.install') },
    { title: t('steps.auth') },
    { title: t('steps.done') },
  ]

  const isLast = step === 3

  return (
    <Modal
      open={visible}
      closable={false}
      maskClosable={false}
      footer={null}
      width={640}
      className="engine-setup-modal"
      data-testid="engine-setup-flow"
    >
      <div className="engine-setup__header">
        <RobotOutlined style={{ fontSize: 28, marginRight: 12 }} />
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>{t('title')}</Typography.Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('subtitle')}</Text>
        </div>
      </div>

      <Steps current={step} items={stepItems} size="small" style={{ margin: '20px 0 24px' }} />

      <div className="engine-setup__body">
        {step === 0 && renderPickStep()}
        {step === 1 && renderInstallStep()}
        {step === 2 && renderAuthStep()}
        {step === 3 && renderDoneStep()}
      </div>

      <div className="engine-setup__footer">
        {!isLast && (
          <div className="engine-setup__footer-main">
            {step > 0 && (
              <Button onClick={() => setStep((s) => (s - 1) as FlowStep)}>{t('actions.back')}</Button>
            )}
            <Button type="primary" onClick={() => void goNext()} data-testid="engine-setup-next">
              {t('actions.next')}
            </Button>
          </div>
        )}
        {isLast && (
          <Button type="primary" block onClick={() => void handleFinishReady()} data-testid="engine-setup-enter">
            {t('actions.enterApp')}
          </Button>
        )}
        <div className="engine-setup__vault-only">
          <Button type="text" size="small" onClick={() => void handleVaultOnly()} data-testid="engine-setup-vault-only">
            {t('actions.vaultOnly')}
          </Button>
          <Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 0, textAlign: 'center' }}>
            {t('actions.vaultOnlyHint')}
          </Paragraph>
        </div>
      </div>
    </Modal>
  )
}

export default EngineSetupFlow
