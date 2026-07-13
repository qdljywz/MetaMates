import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, List, Space, Tag, Typography, message } from 'antd'
import { CloudDownloadOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text, Paragraph } = Typography

interface PluginStatus {
  id: string
  installed: boolean
  version?: string
  name?: string
  nameZh?: string
  description?: string
  descriptionZh?: string
  sizeHintMb?: number
  devBundled?: boolean
  bundledZipAvailable?: boolean
}

interface PluginSettingsPanelProps {
  focusPluginId?: string
}

type PluginDefinition = {
  id: string
  fallbackTitleKey: string
  fallbackDescKey: string
  getStatus: () => Promise<PluginStatus>
  installFromGitHub: (options?: { version?: string; fromDev?: boolean }) => Promise<{ success: boolean; error?: string }>
}

function notifyPluginsChanged(): void {
  window.dispatchEvent(new CustomEvent('metamates:plugins-changed'))
}

function mapPluginInstallError(error: string | undefined, t: (key: string) => string): string {
  if (!error) return t('settings.pluginInstallErrorGeneric')
  const lower = error.toLowerCase()
  if (lower.includes('404') || lower.includes('not found')) {
    return t('settings.pluginInstallError404')
  }
  if (lower.includes('download failed') || lower.includes('network') || lower.includes('econn')) {
    return t('settings.pluginInstallErrorNetwork')
  }
  return error
}

function PluginExtensionCard({
  plugin,
  focusPluginId,
  showDevInstall,
  onRefresh,
}: {
  plugin: PluginDefinition
  focusPluginId?: string
  showDevInstall: boolean
  onRefresh: () => void
}) {
  const { t, i18n } = useTranslation('common')
  const [status, setStatus] = useState<PluginStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [highlighted, setHighlighted] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await plugin.getStatus()
      setStatus(next)
    } finally {
      setLoading(false)
    }
  }, [plugin])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!focusPluginId || focusPluginId !== plugin.id) return
    const timer = window.setTimeout(() => {
      if (!cardRef.current) return
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlighted(true)
    }, 120)
    const clearTimer = window.setTimeout(() => {
      setHighlighted(false)
    }, 1900)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(clearTimer)
    }
  }, [focusPluginId, plugin.id])

  const displayName =
    i18n.language.startsWith('zh') ? status?.nameZh || status?.name : status?.name || status?.nameZh
  const displayDesc =
    i18n.language.startsWith('zh')
      ? status?.descriptionZh || status?.description
      : status?.description || status?.descriptionZh

  const handleInstallFromGitHub = async () => {
    setInstalling(true)
    try {
      const result = await plugin.installFromGitHub()
      if (result.success) {
        message.success(t('settings.pluginInstallSuccess'))
        notifyPluginsChanged()
        await refresh()
        onRefresh()
      } else {
        message.error(mapPluginInstallError(result.error, t))
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleInstallFromDev = async () => {
    setInstalling(true)
    try {
      const result = await plugin.installFromGitHub({ fromDev: true })
      if (result.success) {
        message.success(t('settings.pluginInstallSuccess'))
        notifyPluginsChanged()
        await refresh()
        onRefresh()
      } else {
        message.error(mapPluginInstallError(result.error, t))
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async () => {
    if (!window.electronAPI?.plugins?.uninstall || !status?.id) return
    setInstalling(true)
    try {
      await window.electronAPI.plugins.uninstall(status.id)
      message.success(t('settings.pluginUninstallSuccess'))
      notifyPluginsChanged()
      await refresh()
      onRefresh()
    } finally {
      setInstalling(false)
    }
  }

  const sizeHint =
    status?.sizeHintMb != null
      ? t('settings.pluginSizeHint', { size: status.sizeHintMb })
      : null

  return (
    <div
      ref={cardRef}
      data-testid={`plugin-card-${plugin.id}`}
      className={`settings-plugin-card${highlighted ? ' settings-plugin-card--highlighted' : ''}`}
    >
      <List
        loading={loading}
        dataSource={status ? [status] : []}
        renderItem={(item) => (
          <List.Item
            actions={[
              item.installed ? (
                <Button
                  key="uninstall"
                  danger
                  icon={<DeleteOutlined />}
                  loading={installing}
                  onClick={() => void handleUninstall()}
                >
                  {t('settings.pluginUninstall')}
                </Button>
              ) : (
                <Button
                  key="install"
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  loading={installing}
                  onClick={() => void handleInstallFromGitHub()}
                >
                  {status?.bundledZipAvailable
                    ? t('settings.pluginInstallFromBundle')
                    : t('settings.pluginInstallFromGitHub')}
                </Button>
              ),
            ]}
          >
            <List.Item.Meta
              title={
                <Space wrap>
                  <span>{displayName || t(plugin.fallbackTitleKey)}</span>
                  {item.installed ? (
                    <Tag className="mm-tag mm-tag--teal">{t('settings.pluginInstalled')}</Tag>
                  ) : (
                    <Tag>{t('settings.pluginNotInstalled')}</Tag>
                  )}
                  {item.version && <Text type="secondary">v{item.version}</Text>}
                  {sizeHint && !item.installed && <Text type="secondary">{sizeHint}</Text>}
                </Space>
              }
              description={displayDesc || t(plugin.fallbackDescKey)}
            />
          </List.Item>
        )}
      />

      <Space wrap style={{ marginTop: 8 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void refresh()} disabled={loading}>
          {t('settings.pluginRefresh')}
        </Button>
        {!status?.installed && status?.bundledZipAvailable && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('settings.pluginBundledZipHint')}
          </Text>
        )}
        {showDevInstall && (
          <Button loading={installing} onClick={() => void handleInstallFromDev()}>
            {t('settings.pluginInstallFromDev')}
          </Button>
        )}
      </Space>
    </div>
  )
}

const PluginSettingsPanel: React.FC<PluginSettingsPanelProps> = ({ focusPluginId }) => {
  const { t } = useTranslation('common')
  const [showDevInstall, setShowDevInstall] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const detectRuntime = async () => {
      try {
        const runtime = await window.electronAPI?.getRuntimeInfo?.()
        setShowDevInstall(runtime?.isPackaged === false)
      } catch {
        setShowDevInstall(false)
      }
    }
    void detectRuntime()
  }, [])

  const plugins: PluginDefinition[] = [
    {
      id: 'document-import',
      fallbackTitleKey: 'settings.pluginDocumentImport',
      fallbackDescKey: 'settings.pluginDocumentImportHint',
      getStatus: async () => {
        if (!window.electronAPI?.plugins?.getDocumentImportStatus) {
          return { id: 'document-import', installed: false }
        }
        return window.electronAPI.plugins.getDocumentImportStatus()
      },
      installFromGitHub: (options) => {
        if (!window.electronAPI?.plugins?.installDocumentImport) {
          return Promise.resolve({ success: false, error: 'plugins API unavailable' })
        }
        return window.electronAPI.plugins.installDocumentImport(options)
      },
    },
    {
      id: 'offline-speech',
      fallbackTitleKey: 'settings.pluginOfflineSpeech',
      fallbackDescKey: 'settings.pluginOfflineSpeechHint',
      getStatus: async () => {
        if (!window.electronAPI?.plugins?.getOfflineSpeechStatus) {
          return { id: 'offline-speech', installed: false }
        }
        return window.electronAPI.plugins.getOfflineSpeechStatus()
      },
      installFromGitHub: (options) => {
        if (!window.electronAPI?.plugins?.installOfflineSpeech) {
          return Promise.resolve({ success: false, error: 'plugins API unavailable' })
        }
        return window.electronAPI.plugins.installOfflineSpeech(options)
      },
    },
  ]

  return (
    <div key={refreshKey}>
      {plugins.map((plugin) => (
        <PluginExtensionCard
          key={plugin.id}
          plugin={plugin}
          focusPluginId={focusPluginId}
          showDevInstall={showDevInstall}
          onRefresh={() => setRefreshKey((value) => value + 1)}
        />
      ))}

      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
        {t('settings.pluginDocumentImportFootnote')}
      </Paragraph>
    </div>
  )
}

export default PluginSettingsPanel
