import React, { useState, useEffect } from 'react'
import { Modal, Steps, Button, Result, Typography, message } from 'antd'
import {
  RocketOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { storageService } from '../services/storage'
import { useTranslation } from 'react-i18next'
import { BRAND_I18N } from '../constants/brand'
import { engineSetupPendingPatch } from '../utils/engineSetupPolicy'
import logoPng from '../assets/logo.png'

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
  const { t: tCommon } = useTranslation('common')
  const [currentStep, setCurrentStep] = useState(0)
  const [localWorkspace, setLocalWorkspace] = useState(workspacePath ?? '')
  const [selectingWorkspace, setSelectingWorkspace] = useState(false)

  useEffect(() => {
    if (workspacePath) setLocalWorkspace(workspacePath)
  }, [workspacePath])

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
      ...(localWorkspace ? { workspacePath: localWorkspace } : {}),
      ...engineSetupPendingPatch(),
    })

    if (localWorkspace && window.electronAPI?.acp?.setWorkspacePath) {
      const syncResult = await window.electronAPI.acp.setWorkspacePath(localWorkspace) as {
        success?: boolean
        skillsCreated?: string[]
      } | undefined
      if (syncResult?.skillsCreated?.length) {
        message.success(t('steps.workspace.skillsSynced', { count: syncResult.skillsCreated.length }))
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
            icon={<img src={logoPng} alt="MetaMates" style={{ width: 64, height: 64, objectFit: 'contain' }} />}
            title={t('steps.welcome.title')}
            subTitle={
              <>
                <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
                  {tCommon(BRAND_I18N.sloganShort)}
                </div>
                <div>{t('steps.welcome.subtitle')}</div>
              </>
            }
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
      title: t('steps.complete.title'),
      icon: <CheckCircleOutlined />,
      content: (
        <Result
          status="success"
          title={t('steps.complete.title')}
          subTitle={t('steps.complete.subtitle')}
          extra={[
            <Button type="primary" key="start" onClick={handleComplete} data-testid="welcome-enable-engine">
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
      message.open({
        type: 'warning',
        content: t('steps.workspace.required'),
        key: 'wizard-workspace-required',
      })
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
    <Modal
      open={visible}
      closable={false}
      maskClosable={false}
      footer={null}
      width={620}
      data-testid="welcome-wizard"
    >
      <Steps current={currentStep} items={steps.map((s) => ({ title: s.title, icon: s.icon }))} />

      <div style={{ marginTop: 24 }}>{steps[currentStep].content}</div>

      {!isLastStep && (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {currentStep > 0 && (
            <Button style={{ marginRight: 8 }} onClick={handlePrev}>
              {t('buttons.previous')}
            </Button>
          )}
          <Button
            type="primary"
            onClick={handleNext}
            disabled={currentStep === 1 && !localWorkspace}
          >
            {t('buttons.next')}
          </Button>
        </div>
      )}
    </Modal>
  )
}

export default WelcomeWizard
