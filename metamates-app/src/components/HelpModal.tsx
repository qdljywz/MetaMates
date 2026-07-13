import React, { useCallback, useEffect, useState } from 'react'
import { Modal, Tabs, Typography, Divider, Space, Tag, Button, Progress, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { GITHUB_ISSUES, GITHUB_REPO } from '../constants/brand'
import {
  BulbOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  BookOutlined,
  QuestionCircleOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography
const { TabPane } = Tabs

type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'dev'

interface HelpModalProps {
  visible: boolean
  onClose: () => void
}

const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation('help')
  const [appVersion, setAppVersion] = useState('0.1.0')
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle')
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const applyUpdaterStatus = useCallback((payload: { status: string; version?: string; percent?: number; message?: string }) => {
    switch (payload.status) {
      case 'checking':
        setUpdatePhase('checking')
        setUpdateError(null)
        break
      case 'available':
        setUpdatePhase('available')
        setRemoteVersion(payload.version ?? null)
        break
      case 'downloading':
        setUpdatePhase('downloading')
        setDownloadPercent(Math.round(payload.percent ?? 0))
        break
      case 'downloaded':
        setUpdatePhase('downloaded')
        setRemoteVersion(payload.version ?? null)
        message.success(t('update.downloaded', { version: payload.version }))
        break
      case 'not-available':
        setUpdatePhase('not-available')
        setRemoteVersion(payload.version ?? null)
        break
      case 'error':
        setUpdatePhase('error')
        setUpdateError(payload.message ?? t('update.errorGeneric'))
        break
      case 'dev':
        setUpdatePhase('dev')
        break
      default:
        break
    }
  }, [t])

  useEffect(() => {
    if (!visible) return

    void window.electronAPI?.getAppVersion?.().then((version) => {
      if (typeof version === 'string' && version) setAppVersion(version)
    })

    const unsubscribe = window.electronAPI?.updater?.onStatus?.(applyUpdaterStatus)
    return () => unsubscribe?.()
  }, [visible, applyUpdaterStatus])

  const handleCheckUpdate = async () => {
    if (!window.electronAPI?.updater?.check) {
      setUpdatePhase('dev')
      return
    }
    setChecking(true)
    setUpdateError(null)
    setUpdatePhase('checking')
    try {
      const result = await window.electronAPI.updater.check()
      if (result?.dev) {
        setUpdatePhase('dev')
        message.info(t('update.devMode'))
        return
      }
      if (result?.ok === false) {
        setUpdatePhase('error')
        setUpdateError(result.error ?? t('update.errorGeneric'))
      }
    } catch (error: unknown) {
      setUpdatePhase('error')
      setUpdateError(error instanceof Error ? error.message : t('update.errorGeneric'))
    } finally {
      setChecking(false)
    }
  }

  const handleInstallUpdate = async () => {
    await window.electronAPI?.updater?.quitAndInstall?.()
  }

  const handleOpenUserManual = async () => {
    if (window.electronAPI?.openUserManual) {
      const result = await window.electronAPI.openUserManual()
      if (!result?.success) {
        message.warning(t('openManualFailed'))
      }
      return
    }
    message.warning(t('openManualFailed'))
  }

  const updateHint = () => {
    switch (updatePhase) {
      case 'checking':
        return t('update.checking')
      case 'available':
        return t('update.available', { version: remoteVersion })
      case 'downloading':
        return t('update.downloading', { percent: downloadPercent })
      case 'downloaded':
        return t('update.ready', { version: remoteVersion })
      case 'not-available':
        return t('update.upToDate')
      case 'error':
        return updateError ?? t('update.errorGeneric')
      case 'dev':
        return t('update.devMode')
      default:
        return null
    }
  }

  const hint = updateHint()

  return (
    <Modal
      title={
        <Space>
          <QuestionCircleOutlined className="title-bar-brand-icon" />
          <span>{t('title')}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
    >
      <Tabs defaultActiveKey="quickstart" tabPosition="left">
        <TabPane
          tab={<Space><RocketOutlined /> {t('tabs.quickstart')}</Space>}
          key="quickstart"
        >
          <Title level={4} style={{ marginBottom: 8 }}>{t('welcome.title')}</Title>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            {t('welcome.description')}
          </Paragraph>
          
          <div style={{ lineHeight: 2.2 }}>
            <div><Text strong>{t('gettingStarted.step1')}</Text> — <Text type="secondary">{t('gettingStarted.step1Desc')}</Text></div>
            <div><Text strong>{t('gettingStarted.step2')}</Text> — <Text type="secondary">{t('gettingStarted.step2Desc')}</Text></div>
            <div><Text strong>{t('gettingStarted.step3')}</Text> — <Text type="secondary">{t('gettingStarted.step3Desc')}</Text></div>
            <div><Text strong>{t('gettingStarted.step4')}</Text> — <Text type="secondary">{t('gettingStarted.step4Desc')}</Text></div>
          </div>
        </TabPane>

        <TabPane
          tab={<Space><BulbOutlined /> {t('tabs.features')}</Space>}
          key="features"
        >
          <Title level={5} style={{ marginBottom: 12 }}>{t('editor.title')}</Title>
          <div style={{ lineHeight: 2, marginBottom: 20 }}>
            <div><Text code>{t('editor.realtimeRender')}</Text> — <Text type="secondary">{t('editor.realtimeRenderDesc')}</Text></div>
            <div><Text code>{t('editor.wikiLink')}</Text> — <Text type="secondary">{t('editor.wikiLinkDesc')}</Text></div>
            <div><Text code>{t('editor.tags')}</Text> — <Text type="secondary">{t('editor.tagsDesc')}</Text></div>
            <div><Text code>{t('editor.autoSave')}</Text> — <Text type="secondary">{t('editor.autoSaveDesc')}</Text></div>
          </div>

          <Title level={5} style={{ marginBottom: 12 }}>{t('features.title')}</Title>
          <div style={{ lineHeight: 2 }}>
            <div>📁 {t('features.fileTree')}</div>
            <div>🔍 {t('features.search')}</div>
            <div>📊 {t('features.graph')}</div>
            <div>📅 {t('features.calendar')}</div>
            <div>🤖 {t('features.ai')}</div>
            <div>🧠 {t('features.memory')}</div>
          </div>
        </TabPane>

        <TabPane
          tab={<Space><BookOutlined /> {t('tabs.syntax')}</Space>}
          key="syntax"
        >
          <Title level={5} style={{ marginBottom: 12 }}>{t('markdown.title')}</Title>
          <div style={{ lineHeight: 2, marginBottom: 20 }}>
            <div><Text code># H1</Text> <Text code>## H2</Text> <Text code>### H3</Text> — {t('markdown.heading')}</div>
            <div><Text code>**{t('markdown.bold')}**</Text> — {t('markdown.bold')}</div>
            <div><Text code>*{t('markdown.italic')}*</Text> — {t('markdown.italic')}</div>
            <div><Text code>~~{t('markdown.strikethrough')}~~</Text> — {t('markdown.strikethrough')}</div>
            <div><Text code>=={t('markdown.highlight')}==</Text> — {t('markdown.highlight')}</div>
            <div><Text code>- {t('markdown.unorderedList')}</Text> — {t('markdown.unorderedList')}</div>
            <div><Text code>1. {t('markdown.orderedList')}</Text> — {t('markdown.orderedList')}</div>
            <div><Text code>- [ ] {t('markdown.todo')}</Text> — {t('markdown.todo')}</div>
          </div>

          <Title level={5} style={{ marginBottom: 12 }}>{t('extendedSyntax.title')}</Title>
          <div style={{ lineHeight: 2 }}>
            <div><Text code>{t('extendedSyntax.wikiLinkExample')}</Text> — {t('extendedSyntax.wikiLink')}</div>
            <div><Text code>{t('extendedSyntax.tagExample')}</Text> — {t('extendedSyntax.tag')}</div>
            <div><Text code>{t('extendedSyntax.highlightExample')}</Text> — {t('extendedSyntax.highlight')}</div>
          </div>
        </TabPane>

        <TabPane
          tab={<Space><ThunderboltOutlined /> {t('tabs.shortcuts')}</Space>}
          key="shortcuts"
        >
          <div style={{ lineHeight: 2.5 }}>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + P</Tag> {t('shortcuts.commandPalette')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + N</Tag> {t('shortcuts.dailyNote')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + Shift + P</Tag> {t('shortcuts.dailyPlan')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + Shift + F</Tag> {t('shortcuts.globalSearch')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + B</Tag> {t('shortcuts.toggleFileTree')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + S</Tag> {t('shortcuts.saveFile')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + W</Tag> {t('shortcuts.closeTab')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + Tab</Tag> {t('shortcuts.nextTab')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + Shift + Tab</Tag> {t('shortcuts.prevTab')}</div>
            <div><Tag className="mm-tag mm-tag--accent">Ctrl + Shift + L</Tag> {t('shortcuts.toggleTheme')}</div>
          </div>
          <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
            {t('shortcuts.editorNote')}
          </Paragraph>
        </TabPane>
      </Tabs>

      <Divider style={{ margin: '16px 0 12px' }} />

      <div style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button icon={<BookOutlined />} onClick={() => void handleOpenUserManual()}>
            {t('openManual')}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={checking || updatePhase === 'checking'}
            onClick={() => void handleCheckUpdate()}
          >
            {t('update.check')}
          </Button>
          {updatePhase === 'downloaded' && (
            <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => void handleInstallUpdate()}>
              {t('update.restart')}
            </Button>
          )}
        </Space>
        {hint && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            {hint}
          </Paragraph>
        )}
        {updatePhase === 'downloading' && (
          <Progress percent={downloadPercent} size="small" style={{ marginTop: 8, maxWidth: 280 }} />
        )}
      </div>
      
      <div className="help-modal__footer">
        <Space split={<Divider type="vertical" />}>
          <span>{t('version')} {appVersion}</span>
          <button
            type="button"
            onClick={() => {
              if (window.electronAPI?.openExternal) {
                void window.electronAPI.openExternal(GITHUB_REPO)
              } else {
                window.open(GITHUB_REPO, '_blank', 'noopener,noreferrer')
              }
            }}
            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12 }}
          >
            {t('github')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.electronAPI?.openExternal) {
                void window.electronAPI.openExternal(GITHUB_ISSUES)
              } else {
                window.open(GITHUB_ISSUES, '_blank', 'noopener,noreferrer')
              }
            }}
            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12 }}
          >
            {t('feedback')}
          </button>
        </Space>
      </div>
    </Modal>
  )
}

export default HelpModal
