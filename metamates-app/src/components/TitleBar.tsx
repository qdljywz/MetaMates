import React, { useState, useEffect } from 'react'
import { Button, Tooltip, Typography, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  BlockOutlined,
  SettingOutlined,
  GithubOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import SettingsModal from './SettingsModal'
import HelpModal from './HelpModal'
import { useTheme } from '../hooks/useTheme'
import './TitleBar.css'
import { GITHUB_REPO, PRODUCT_NAME } from '../constants/brand'
import logoPng from '../assets/logo.png'

const openExternal = (url: string) => {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

const { Text } = Typography

const TitleBar: React.FC = () => {
  const { t } = useTranslation('common')
  const { theme } = useTheme()
  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [helpVisible, setHelpVisible] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.electronAPI?.window?.isMaximized) {
        const maximized = await window.electronAPI.window.isMaximized()
        setIsMaximized(maximized)
      }
    }
    checkMaximized()
  }, [])

  useEffect(() => {
    const openSettings = () => setSettingsVisible(true)
    window.addEventListener('metamates:open-settings', openSettings)
    return () => window.removeEventListener('metamates:open-settings', openSettings)
  }, [])

  const handleMinimize = async () => {
    if (window.electronAPI?.window?.minimize) {
      await window.electronAPI.window.minimize()
    }
  }

  const handleMaximize = async () => {
    if (window.electronAPI?.window?.maximize) {
      await window.electronAPI.window.maximize()
      const maximized = await window.electronAPI.window.isMaximized()
      setIsMaximized(maximized)
    }
  }

  const handleClose = async () => {
    if (window.electronAPI?.window?.close) {
      await window.electronAPI.window.close()
    }
  }

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <div className="title-bar-logo">
          <img 
            src={logoPng} 
            alt={PRODUCT_NAME} 
            style={{ 
              width: '24px', 
              height: '24px', 
              objectFit: 'contain' 
            }} 
          />
        </div>
        <Space style={{ marginLeft: 8 }}>
          <Text strong style={{ 
            fontSize: '16px',
            background: 'linear-gradient(90deg, #ff7a00, #00b4a6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>{t('app.name')}</Text>
          <Text type="secondary" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('app.subtitle')}</Text>
        </Space>
      </div>
      <div className="title-bar-center">
        <Space size="middle">
          <Tooltip title={t('help')}>
            <QuestionCircleOutlined 
              data-testid="help-button"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              onClick={() => setHelpVisible(true)}
            />
          </Tooltip>
          <Tooltip title={t('settings.title')}>
            <SettingOutlined 
              data-testid="settings-button"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              onClick={() => setSettingsVisible(true)}
            />
          </Tooltip>
          <Tooltip title="GitHub">
            <GithubOutlined 
              data-testid="github-button"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              onClick={() => openExternal(GITHUB_REPO)}
            />
          </Tooltip>
        </Space>
      </div>
      <div className="title-bar-controls">
        <Tooltip title={t('window.minimize')}>
          <Button
            type="text"
            size="small"
            icon={<MinusOutlined />}
            onClick={handleMinimize}
            className="title-bar-btn"
            data-testid="minimize-button"
          />
        </Tooltip>
        <Tooltip title={isMaximized ? t('window.restore') : t('window.maximize')}>
          <Button
            type="text"
            size="small"
            icon={isMaximized ? <BlockOutlined /> : <BorderOutlined />}
            onClick={handleMaximize}
            className="title-bar-btn"
            data-testid="maximize-button"
          />
        </Tooltip>
        <Tooltip title={t('window.close')}>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={handleClose}
            className="title-bar-btn title-bar-btn-close"
            data-testid="close-button"
          />
        </Tooltip>
      </div>
      
      <SettingsModal 
        visible={settingsVisible} 
        onClose={() => setSettingsVisible(false)} 
      />
      <HelpModal 
        visible={helpVisible} 
        onClose={() => setHelpVisible(false)} 
      />
    </div>
  )
}

export default TitleBar
