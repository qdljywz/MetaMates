import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Steps, Button, Result, Typography, Tag, Spin, message } from 'antd'
import {
  CheckCircleOutlined,
  RocketOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  DesktopOutlined,
} from '@ant-design/icons'
import { storageService } from '../services/storage'
import { useTranslation } from 'react-i18next'
import { CliInstallPanel } from './CliInstallPanel'
import type { DetectedAgent } from '../types/electron'

const { Paragraph, Text } = Typography

interface WelcomeWizardProps {
  visible: boolean
  workspacePath?: string
  onComplete: () => void
  onWorkspaceSelected: (path: string) => void
}

const WelcomeWizard: React.FC<WelcomeWizardProps> = ({
  visible,
  workspacePath,
  onComplete,
  onWorkspaceSelected,
}) => {
  const { t, i18n } = useTranslation('welcome')
  const [currentStep, setCurrentStep] = useState(0)
  const [localWorkspace, setLocalWorkspace] = useState(workspacePath ?? '')
  const [agents, setAgents] = useState<DetectedAgent[]>([])
  const [detectingAgents, setDetectingAgents] = useState(false)
  const [cliPanelOpen, setCliPanelOpen] = useState(false)
  const [selectingWorkspace, setSelectingWorkspace] = useState(false)

  useEffect(() => {
    if (workspacePath) setLocalWorkspace(workspacePath)
  }, [workspacePath])

  const refreshAgents = useCallback(async () => {
    if (!window.electronAPI?.acp?.detectAgents) {
      setAgents([])
      return
    }
    setDetectingAgents(true)
    try {
      const list = await window.electronAPI.acp.detectAgents()
      setAgents(list ?? [])
    } catch {
      setAgents([])
    } finally {
      setDetectingAgents(false)
    }
  }, [])

  useEffect(() => {
    if (visible && currentStep === 2) {
      refreshAgents()
    }
  }, [visible, currentStep, refreshAgents])

  const handleSelectWorkspace = async () => {
    if (!window.electronAPI) {
      message.error(t('steps.workspace.desktopOnly'))
      return
    }
    setSelectingWorkspace(true)
    try {
      const result = await window.electronAPI.selectDirectory()
      if (!result.canceled && result.filePaths.length > 0) {
        const path = result.filePaths[0]
        const lang = i18n.language?.startsWith('en') ? 'en' : 'zh'
        const init = await window.electronAPI.initWorkspace(path, lang)
        if (!init.success && init.error) {
          message.warning(init.error)
        } else if (init.initialized) {
          message.success(t('steps.workspace.initialized'))
        }
        setLocalWorkspace(path)
        onWorkspaceSelected(path)
      }
    } finally {
      setSelectingWorkspace(false)
    }
  }

  const handleComplete = async () => {
    await storageService.saveSettings({
      theme: 'dark',
      fontSize: 14,
      autoSave: true,
      language: i18n.language?.startsWith('en') ? 'en' : 'zh',
    })

    if (localWorkspace && window.electronAPI?.acp) {
      const syncResult = await window.electronAPI.acp.setWorkspacePath(localWorkspace) as {
        success?: boolean
        skillsCreated?: string[]
      } | undefined
      if (syncResult?.skillsCreated?.length) {
        message.success(t('steps.workspace.skillsSynced', { count: syncResult.skillsCreated.length }))
      }
      const list = agents.length > 0 ? agents : await window.electronAPI.acp.detectAgents()
      if (list.length > 0) {
        const backend = list[0].backend
        try {
          await window.electronAPI.acp.connect(backend, { autoStart: true })
          await window.electronAPI.acp.newSession(backend)
          message.success(t('steps.agent.connected', { name: list[0].name || backend }))
        } catch {
          message.info(t('steps.agent.connectLater'))
        }
      }
    }

    onComplete()
  }

  const steps = [
    {
      title: t('steps.welcome.title'),
      icon: <RocketOutlined />,
      content: (
        <div style={{ padding: '12px 0' }}>
          <Result
            icon={<DesktopOutlined style={{ color: '#1890ff' }} />}
            title={t('steps.welcome.title')}
            subTitle={t('steps.welcome.subtitle')}
          />
          <Paragraph style={{ textAlign: 'left', maxWidth: 440, margin: '0 auto' }}>
            {t('steps.welcome.description')}
            <ul style={{ marginTop: 10 }}>
              <li>🤖 {t('steps.welcome.features.agent')}</li>
              <li>⚡ {t('steps.welcome.features.commands')}</li>
              <li>📁 {t('steps.welcome.features.vault')}</li>
              <li>📱 {t('steps.welcome.features.capture')}</li>
            </ul>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('steps.welcome.desktopNote')}
            </Text>
          </Paragraph>
        </div>
      ),
    },
    {
      title: t('steps.workspace.title'),
      icon: <FolderOpenOutlined />,
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Paragraph>{t('steps.workspace.description')}</Paragraph>
          {localWorkspace ? (
            <Paragraph>
              <Text type="success">{t('steps.workspace.selected')}:</Text>
              <br />
              <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {localWorkspace}
              </Text>
            </Paragraph>
          ) : (
            <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          )}
          <Button
            type="primary"
            size="large"
            icon={<FolderOpenOutlined />}
            loading={selectingWorkspace}
            onClick={handleSelectWorkspace}
          >
            {t('steps.workspace.selectButton')}
          </Button>
        </div>
      ),
    },
    {
      title: t('steps.agent.title'),
      icon: <RobotOutlined />,
      content: (
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <Paragraph>{t('steps.agent.description')}</Paragraph>
          {detectingAgents ? (
            <Spin tip={t('steps.agent.detecting')} />
          ) : agents.length > 0 ? (
            <Paragraph>
              <Text type="success">{t('steps.agent.found', { count: agents.length })}</Text>
              <div style={{ marginTop: 12 }}>
                {agents.map((a) => (
                  <Tag key={a.backend} color="blue" style={{ marginBottom: 4 }}>
                    {a.name || a.backend}
                  </Tag>
                ))}
              </div>
            </Paragraph>
          ) : (
            <Paragraph type="secondary">{t('steps.agent.none')}</Paragraph>
          )}
          <Button type="primary" onClick={() => setCliPanelOpen(true)} style={{ marginTop: 8 }}>
            {t('steps.agent.installButton')}
          </Button>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16 }}>
            {t('steps.agent.skipHint')}
          </Paragraph>
        </div>
      ),
    },
    {
      title: t('steps.complete.title'),
      icon: <CheckCircleOutlined />,
      content: (
        <Result
          status="success"
          title={t('steps.complete.title')}
          subTitle={t('steps.complete.subtitle')}
          extra={[
            <Button type="primary" key="start" onClick={handleComplete}>
              {t('steps.complete.startButton')}
            </Button>,
          ]}
        />
      ),
    },
  ]

  const isLastStep = currentStep === steps.length - 1

  const handleNext = () => {
    if (currentStep === 1 && !localWorkspace) {
      message.warning(t('steps.workspace.required'))
      return
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  return (
    <>
      <Modal open={visible} closable={false} maskClosable={false} footer={null} width={620}>
        <Steps current={currentStep} items={steps.map((s) => ({ title: s.title, icon: s.icon }))} />

        <div style={{ marginTop: 24 }}>{steps[currentStep].content}</div>

        {!isLastStep && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            {currentStep > 0 && (
              <Button style={{ marginRight: 8 }} onClick={handlePrev}>
                {t('buttons.previous')}
              </Button>
            )}
            <Button type="primary" onClick={handleNext}>
              {t('buttons.next')}
            </Button>
          </div>
        )}
      </Modal>

      <CliInstallPanel
        open={cliPanelOpen}
        onClose={() => {
          setCliPanelOpen(false)
          refreshAgents()
        }}
      />
    </>
  )
}

export default WelcomeWizard
