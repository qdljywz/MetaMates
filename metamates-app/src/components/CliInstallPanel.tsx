import { useState, useEffect, useCallback } from 'react'
import { Modal, Button, List, Spin, Typography, Badge, message, Switch, Space } from 'antd'
import { DownloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { cliInstaller } from '../services/agent-bridge/installer'
import { storageService } from '../services/storage'
import type { AcpBackend } from '../services/agent-bridge/acpTypes'
import { ACP_BACKENDS } from '../services/agent-bridge/acpTypes'

interface CliInstallStatus {
  installed: boolean
  installing: boolean
  progress?: string
}

interface CliInstallPanelProps {
  open: boolean
  onClose: () => void
}

function isBackendEnabled(
  backend: string,
  enabledMap: Record<string, boolean> | undefined,
): boolean {
  if (!enabledMap || !(backend in enabledMap)) return true
  return enabledMap[backend] !== false
}

export const CliInstallPanel: React.FC<CliInstallPanelProps> = ({ open, onClose }) => {
  const { t } = useTranslation('cli')
  const [installStatus, setInstallStatus] = useState<Map<AcpBackend, CliInstallStatus>>(new Map())
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [togglingBackend, setTogglingBackend] = useState<string | null>(null)

  const loadEnabledMap = useCallback(async () => {
    const settings = await storageService.getSettings()
    setEnabledMap(settings.cliAgentEnabled || {})
  }, [])

  useEffect(() => {
    if (open) {
      void loadStatus()
      void loadEnabledMap()
    }
  }, [open, loadEnabledMap])

  useEffect(() => {
    const unsubscribe = cliInstaller.onInstallProgress((backend, progress) => {
      setInstallStatus((prev) => {
        const newMap = new Map(prev)
        const current = prev.get(backend) || { installed: false, installing: false }
        newMap.set(backend, {
          ...current,
          progress: progress.message,
          installing: progress.stage === 'installing',
        })
        return newMap
      })
    })
    return () => unsubscribe()
  }, [])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const status = await cliInstaller.checkAllInstallations()
      const statusMap = new Map<AcpBackend, CliInstallStatus>()
      status.forEach((value, key) => {
        statusMap.set(key, {
          installed: value.installed,
          installing: false,
        })
      })
      setInstallStatus(statusMap)
    } catch (error) {
      console.error('Failed to load CLI status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (backend: AcpBackend) => {
    const result = await cliInstaller.installCli(backend)
    if (result.success) {
      message.success(t('messages.installSuccess', { name: ACP_BACKENDS[backend].name }))
      await window.electronAPI?.acp?.refreshAgents?.()
      await loadStatus()
      await loadEnabledMap()
    } else {
      message.error(result.error || t('messages.installFailed'))
    }
  }

  const handleUninstall = async (backend: AcpBackend) => {
    const config = ACP_BACKENDS[backend]
    if (config.npmPackage) {
      const result = await cliInstaller.uninstallCli(backend)
      if (result.success) {
        message.success(t('messages.uninstallSuccess', { name: config.name }))
        const nextMap = { ...enabledMap }
        delete nextMap[backend]
        setEnabledMap(nextMap)
        await storageService.saveSettings({ cliAgentEnabled: nextMap })
        await loadStatus()
        await window.electronAPI?.acp?.refreshAgents?.()
      } else {
        message.error(result.error || t('messages.uninstallFailed'))
      }
    }
  }

  const handleToggleEnabled = async (backend: AcpBackend, enabled: boolean) => {
    setTogglingBackend(backend)
    const prevMap = enabledMap
    const nextMap = { ...enabledMap, [backend]: enabled }
    setEnabledMap(nextMap)
    try {
      await storageService.saveSettings({ cliAgentEnabled: nextMap })

      const setEnabled = window.electronAPI?.acp?.setCliAgentEnabled
      if (setEnabled) {
        try {
          const result = await setEnabled(backend, enabled)
          if (!result?.success) {
            console.warn('[CLI] setCliAgentEnabled returned failure:', result?.error)
            await window.electronAPI?.acp?.refreshAgents?.()
          }
        } catch (ipcError) {
          console.warn('[CLI] setCliAgentEnabled IPC failed, settings were still saved:', ipcError)
          await window.electronAPI?.acp?.refreshAgents?.()
        }
      } else {
        await window.electronAPI?.acp?.refreshAgents?.()
      }

      message.success(
        enabled
          ? t('messages.enabledSuccess', { name: ACP_BACKENDS[backend].name })
          : t('messages.disabledSuccess', { name: ACP_BACKENDS[backend].name }),
      )
    } catch (error) {
      console.error('Failed to toggle CLI agent:', error)
      setEnabledMap(prevMap)
      message.error(t('messages.toggleFailed'))
    } finally {
      setTogglingBackend(null)
    }
  }

  const getStatusBadge = (backend: AcpBackend) => {
    const status = installStatus.get(backend)
    if (status?.installing) {
      return <Badge status="processing" text={t('status.installing')} />
    }
    if (status?.installed) {
      const enabled = isBackendEnabled(backend, enabledMap)
      if (!enabled) {
        return <Badge status="default" text={t('status.disabledInApp')} />
      }
      return <Badge status="success" text={t('status.installed')} />
    }
    return <Badge status="default" text={t('status.notInstalled')} />
  }

  const getInstallButton = (backend: AcpBackend) => {
    const status = installStatus.get(backend)
    const config = ACP_BACKENDS[backend]
    if (!config || config.isBuiltIn) {
      return null
    }
    if (status?.installing) {
      return (
        <Button size="small" disabled icon={<Spin size="small" />}>
          {t('status.installing')}
        </Button>
      )
    }
    if (status?.installed) {
      return (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleUninstall(backend)}>
          {t('actions.uninstall')}
        </Button>
      )
    }
    if (cliInstaller.canInstall(backend)) {
      return (
        <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => handleInstall(backend)}>
          {t('actions.install')}
        </Button>
      )
    }
    return (
      <Button size="small" disabled>
        {t('actions.notAvailable')}
      </Button>
    )
  }

  const getUseSwitch = (backend: AcpBackend) => {
    const status = installStatus.get(backend)
    if (!status?.installed || status.installing) return null
    const enabled = isBackendEnabled(backend, enabledMap)
    return (
      <Space size={6} align="center">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('actions.useInApp')}
        </Typography.Text>
        <Switch
          size="small"
          checked={enabled}
          loading={togglingBackend === backend}
          onChange={(checked) => void handleToggleEnabled(backend, checked)}
        />
      </Space>
    )
  }

  const backends = (Object.keys(ACP_BACKENDS).filter((b) => {
    const cfg = ACP_BACKENDS[b as AcpBackend]
    return !cfg.isBuiltIn && cfg.enabled !== false && b !== 'custom'
  }) as AcpBackend[])

  return (
    <Modal title={t('title')} open={open} onCancel={onClose} footer={null} width={640}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        {t('hint')}
      </Typography.Paragraph>
      <Spin spinning={loading} tip={t('loading')}>
        <List
          dataSource={backends}
          renderItem={(backend) => {
            const config = ACP_BACKENDS[backend]
            const status = installStatus.get(backend)
            return (
              <List.Item key={backend} actions={[getUseSwitch(backend), getInstallButton(backend)].filter(Boolean)}>
                <List.Item.Meta
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <span>{config.name}</span>
                      {getStatusBadge(backend)}
                    </div>
                  }
                  description={
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {config.description}
                      </Typography.Text>
                      {status?.progress && (
                        <div style={{ marginTop: 4, color: '#1890ff', fontSize: 12 }}>{status.progress}</div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      </Spin>
    </Modal>
  )
}

export default CliInstallPanel
