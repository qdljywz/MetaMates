import React, { useState } from 'react'
import { Layout, Typography, Space, Tooltip } from 'antd'
import { GithubOutlined, SettingOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import SettingsModal from './SettingsModal'
import { useTheme } from '../hooks/useTheme'

const { Header: AntHeader } = Layout
const { Text } = Typography

const Header: React.FC = () => {
  const { t } = useTranslation('common')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'

  return (
    <>
      <AntHeader style={{
        background: isDark ? '#1e1e2e' : '#ffffff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
        height: '48px',
        lineHeight: '48px',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <Space>
          <Text strong style={{ color: '#2563eb', fontSize: '18px' }}>
            {t('app.name')}
          </Text>
          <Text type="secondary" style={{ fontSize: '12px', color: isDark ? '#a6adc8' : '#6b7280' }}>
            {t('app.subtitle')}
          </Text>
        </Space>
        
        <Space size="middle">
          <Tooltip title={t('help')}>
            <QuestionCircleOutlined 
              style={{ color: isDark ? '#a6adc8' : '#6b7280', cursor: 'pointer', fontSize: '16px' }} 
              onClick={() => {
                console.log('帮助按钮被点击')
              }}
            />
          </Tooltip>
          <Tooltip title={t('settings.title')}>
            <SettingOutlined 
              style={{ color: isDark ? '#a6adc8' : '#6b7280', cursor: 'pointer', fontSize: '16px' }} 
              onClick={(e) => {
                console.log('设置按钮被点击', e)
                setSettingsVisible(true)
              }}
            />
          </Tooltip>
          <Tooltip title="GitHub">
            <GithubOutlined 
              style={{ color: isDark ? '#a6adc8' : '#6b7280', cursor: 'pointer', fontSize: '16px' }}
              onClick={() => {
                window.open('https://github.com', '_blank')
              }}
            />
          </Tooltip>
        </Space>
      </AntHeader>
      
      <SettingsModal 
        visible={settingsVisible} 
        onClose={() => setSettingsVisible(false)} 
      />
    </>
  )
}

export default Header
