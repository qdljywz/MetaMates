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
  const [settingsTabKey, setSettingsTabKey] = useState<'general' | 'agent' | 'advanced'>('general')
  const [settingsFocusPluginId, setSettingsFocusPluginId] = useState<string | undefined>(undefined)
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
    const openSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: 'general' | 'agent' | 'advanced'; focusPluginId?: string }>).detail
      if (detail?.tab) setSettingsTabKey(detail.tab)
      setSettingsFocusPluginId(detail?.focusPluginId)
      setSettingsVisible(true)
    }
    window.addEventListener('metamates:open-settings', openSettings as EventListener)
    return () => window.removeEventListener('metamates:open-settings', openSettings as EventListener)
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
          <Text strong className="title-bar-brand-name brand-gradient-text">{t('app.name')}</Text>
          <Text type="secondary" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('app.subtitle')}</Text>
        </Space>
      </div>
      <div className="title-bar-center">
        <Space size="middle">
          <Tooltip title={t('help')}>
            <QuestionCircleOutlined 
              data-testid="help-button"
              role="button"
              tabIndex={0}
              aria-label={t('help')}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              onClick={() => setHelpVisible(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHelpVisible(true) } }}
            />
          </Tooltip>
          <Tooltip title={t('settings.title')}>
            <SettingOutlined 
              data-testid="settings-button"
              role="button"
              tabIndex={0}
              aria-label={t('settings.title')}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              onClick={() => setSettingsVisible(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSettingsVisible(true) } }}
            />
          </Tooltip>
          <Tooltip title={t('github')}>
            <GithubOutlined 
              data-testid="github-button"
              role="button"
              tabIndex={0}
              aria-label={t('github')}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              onClick={() => openExternal(GITHUB_REPO)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openExternal(GITHUB_REPO) } }}
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
            aria-label={t('window.minimize')}
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
            aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
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
            aria-label={t('window.close')}
          />
        </Tooltip>
      </div>
      
      <SettingsModal 
        visible={settingsVisible} 
        initialTabKey={settingsTabKey}
        focusPluginId={settingsFocusPluginId}
        onClose={() => {
          setSettingsVisible(false)
          setSettingsFocusPluginId(undefined)
        }} 
      />
      <HelpModal 
        visible={helpVisible} 
        onClose={() => setHelpVisible(false)} 
      />
    </div>
  )
}

export default TitleBar
