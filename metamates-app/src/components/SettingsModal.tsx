import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Form, Select, Button, Switch, message, Row, Col, Typography, InputNumber, Input, Space, QRCode } from 'antd'
import { FolderOpenOutlined, SyncOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { storageService } from '../services/storage'
import { useTheme } from '../hooks/useTheme'
import { useAppContext } from '../store/AppContext'
import CliInstallPanel from './CliInstallPanel'
import McpSettingsPanel from './McpSettingsPanel'

const { Option } = Select
const { Text, Paragraph } = Typography

interface SettingsModalProps {
  visible: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose }) => {
  const { t, i18n } = useTranslation('common')
  const { state } = useAppContext()
  const { setThemeMode, setColorScheme } = useTheme()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [vaultApiStatus, setVaultApiStatus] = useState<{ running: boolean; port: number } | null>(null)
  const [lanAddresses, setLanAddresses] = useState<string[]>([])
  const [ollamaStatus, setOllamaStatus] = useState<{ running: boolean; models: Array<{ name: string }> } | null>(null)
  const [cliInstallOpen, setCliInstallOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [syncingSkills, setSyncingSkills] = useState(false)
  const [agentSnapshot, setAgentSnapshot] = useState({
    vaultApiEnabled: false,
    vaultApiPort: 17333,
    vaultApiLanAccess: false,
    ollamaEnabled: false,
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
  })

  useEffect(() => {
    if (visible) loadSettings()
  }, [visible])

  const loadSettings = async () => {
    const settings = await storageService.getSettings()
    form.setFieldsValue({
      theme: settings.theme || 'dark',
      colorScheme: (settings as any).colorScheme || 'default',
      fontSize: settings.fontSize || 14,
      autoSave: settings.autoSave !== false,
      language: settings.language || 'zh',
      vaultApiEnabled: settings.vaultApiEnabled || false,
      vaultApiPort: settings.vaultApiPort || 17333,
      vaultApiLanAccess: settings.vaultApiLanAccess || false,
      calendarIcsPath: settings.calendarIcsPath || '',
      ollamaEnabled: settings.ollamaEnabled || false,
      ollamaBaseUrl: settings.ollamaBaseUrl || 'http://127.0.0.1:11434',
      ollamaModel: settings.ollamaModel || 'llama3.2',
      mobileReaderEnabled: settings.mobileReaderEnabled !== false,
    })

    setAgentSnapshot({
      vaultApiEnabled: settings.vaultApiEnabled || false,
      vaultApiPort: settings.vaultApiPort || 17333,
      vaultApiLanAccess: settings.vaultApiLanAccess || false,
      ollamaEnabled: settings.ollamaEnabled || false,
      ollamaBaseUrl: settings.ollamaBaseUrl || 'http://127.0.0.1:11434',
      ollamaModel: settings.ollamaModel || 'llama3.2',
    })

    if (window.electronAPI?.ollama) {
      const status = await window.electronAPI.ollama.getStatus(settings.ollamaBaseUrl)
      setOllamaStatus({ running: status.running, models: status.models || [] })
    }

    if (window.electronAPI?.vaultApi) {
      if (window.electronAPI.vaultApi.getLanAddresses) {
        const lan = await window.electronAPI.vaultApi.getLanAddresses()
        setLanAddresses(lan.addresses || [])
      }

      if (settings.vaultApiEnabled && state.workspacePath) {
        const result = await window.electronAPI.vaultApi.start(
          state.workspacePath,
          settings.vaultApiPort || 17333,
          settings.calendarIcsPath,
          !!settings.vaultApiLanAccess
        )
        if (result.success) {
          setVaultApiStatus({ running: true, port: result.port })
        } else {
          setVaultApiStatus({ running: false, port: settings.vaultApiPort || 17333 })
          message.warning(t('settings.vaultApiStartFailed') + ': ' + result.error)
        }
      } else {
        const status = await window.electronAPI.vaultApi.getStatus()
        setVaultApiStatus({ running: status.running, port: status.port || settings.vaultApiPort || 17333 })
      }
    }
  }

  const vaultApiEnabled = Form.useWatch('vaultApiEnabled', form) ?? false
  const watchedPort = Form.useWatch('vaultApiPort', form) ?? 17333
  const vaultApiLanAccess = Form.useWatch('vaultApiLanAccess', form) ?? false
  const mobileReaderEnabled = Form.useWatch('mobileReaderEnabled', form)
  const showMobileReader = mobileReaderEnabled !== false

  const effectivePort = vaultApiStatus?.running ? vaultApiStatus.port : watchedPort

  const mobileLocalUrl = useMemo(
    () => (vaultApiEnabled ? `http://127.0.0.1:${effectivePort}/mobile` : ''),
    [vaultApiEnabled, effectivePort]
  )

  const mobileLanUrls = useMemo(() => {
    if (!vaultApiLanAccess || !showMobileReader || !vaultApiEnabled) return []
    return lanAddresses.map((ip) => `http://${ip}:${effectivePort}/mobile`)
  }, [vaultApiLanAccess, showMobileReader, vaultApiEnabled, lanAddresses, effectivePort])

  const primaryMobileLanUrl = mobileLanUrls[0] || ''
  const lanAccessPending = vaultApiLanAccess !== agentSnapshot.vaultApiLanAccess
  const vaultApiPending = vaultApiEnabled !== agentSnapshot.vaultApiEnabled
  const showMobileAccess = vaultApiEnabled && showMobileReader

  const handleSave = async () => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const saveData: any = {
        theme: values.theme,
        fontSize: values.fontSize,
        autoSave: values.autoSave,
        language: values.language,
        vaultApiEnabled: values.vaultApiEnabled,
        vaultApiPort: values.vaultApiPort || 17333,
        vaultApiLanAccess: values.vaultApiLanAccess || false,
        calendarIcsPath: values.calendarIcsPath || '',
        ollamaEnabled: values.ollamaEnabled,
        ollamaBaseUrl: values.ollamaBaseUrl || 'http://127.0.0.1:11434',
        ollamaModel: values.ollamaModel || 'llama3.2',
        mobileReaderEnabled: values.mobileReaderEnabled !== false,
      }
      if (values.colorScheme) saveData.colorScheme = values.colorScheme

      await storageService.saveSettings(saveData)
      if (window.electronAPI?.saveSettings) {
        await window.electronAPI.saveSettings(saveData)
      }

      if (values.theme) setThemeMode(values.theme as 'light' | 'dark' | 'system')
      if (values.colorScheme) setColorScheme(values.colorScheme as 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage')
      if (values.language) {
        i18n.changeLanguage(values.language)
        localStorage.setItem('metamates-language', values.language)
      }

      if (values.vaultApiEnabled && !state.workspacePath) {
        message.warning(t('settings.vaultApiNoWorkspace'))
      } else if (window.electronAPI?.vaultApi && state.workspacePath) {
        if (values.vaultApiEnabled) {
          const result = await window.electronAPI.vaultApi.start(
            state.workspacePath,
            values.vaultApiPort || 17333,
            values.calendarIcsPath || undefined,
            !!values.vaultApiLanAccess
          )
          if (result.success) {
            setVaultApiStatus({ running: true, port: result.port })
            if (window.electronAPI.vaultApi.getLanAddresses) {
              const lan = await window.electronAPI.vaultApi.getLanAddresses()
              setLanAddresses(lan.addresses || [])
            }
          } else {
            setVaultApiStatus({ running: false, port: values.vaultApiPort || 17333 })
            message.warning(t('settings.vaultApiStartFailed') + ': ' + result.error)
          }
        } else {
          await window.electronAPI.vaultApi.stop()
          setVaultApiStatus({ running: false, port: values.vaultApiPort || 17333 })
        }
      }

      setAgentSnapshot({
        vaultApiEnabled: values.vaultApiEnabled || false,
        vaultApiPort: values.vaultApiPort || 17333,
        vaultApiLanAccess: values.vaultApiLanAccess || false,
        ollamaEnabled: values.ollamaEnabled || false,
        ollamaBaseUrl: values.ollamaBaseUrl || 'http://127.0.0.1:11434',
        ollamaModel: values.ollamaModel || 'llama3.2',
      })

      message.success(t('settings.savedSuccess'))

      const needsAgentReload =
        values.vaultApiEnabled !== agentSnapshot.vaultApiEnabled ||
        values.vaultApiPort !== agentSnapshot.vaultApiPort ||
        values.vaultApiLanAccess !== agentSnapshot.vaultApiLanAccess ||
        values.ollamaEnabled !== agentSnapshot.ollamaEnabled ||
        values.ollamaBaseUrl !== agentSnapshot.ollamaBaseUrl ||
        values.ollamaModel !== agentSnapshot.ollamaModel

      if (needsAgentReload && window.electronAPI?.acp?.reloadSessions) {
        await window.electronAPI.acp.refreshAgents?.()
        await window.electronAPI.acp.reloadSessions()
        message.info(t('settings.mcpReconnectHint') || 'Agent 会话已尝试重载以应用设置')
      }
    } catch (error: any) {
      message.error(t('settings.saveFailed') + ': ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePickCalendar = async () => {
    if (!window.electronAPI?.calendar) return
    const result = await window.electronAPI.calendar.pickFile()
    if (!result.canceled && result.filePath) {
      form.setFieldValue('calendarIcsPath', result.filePath)
    }
  }

  const handleSyncSkills = async () => {
    if (!state.workspacePath) {
      message.warning(t('settings.syncSkillsNoWorkspace'))
      return
    }
    const api = window.electronAPI?.acp?.syncWorkspaceSkills
    if (!api) {
      message.error(t('settings.syncSkillsFailed'))
      return
    }

    setSyncingSkills(true)
    try {
      const lang = form.getFieldValue('language') === 'en' ? 'en' : 'zh'
      const result = await api(state.workspacePath, lang)
      if (!result?.success) {
        message.error(result?.error || t('settings.syncSkillsFailed'))
        return
      }
      const created = result.created?.length ?? 0
      const backends = result.backends?.join(', ') || ''
      if (created > 0) {
        message.success(t('settings.syncSkillsCreated', { count: created, backends }))
      } else {
        message.info(t('settings.syncSkillsUpToDate', { backends }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      message.error(`${t('settings.syncSkillsFailed')}: ${msg}`)
    } finally {
      setSyncingSkills(false)
    }
  }

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={t('settings.title')}
      width={520}
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('settings.cancel')}
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={loading}>
          {t('settings.save')}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="theme" label={t('settings.theme')}>
              <Select>
                <Option value="dark">{t('settings.dark')}</Option>
                <Option value="light">{t('settings.light')}</Option>
                <Option value="system">{t('settings.system') || '跟随系统'}</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="colorScheme" label={t('settings.colorScheme')}>
              <Select>
                <Option value="default">{t('settings.colorSchemeDefault')}</Option>
                <Option value="nordic">Nordic</Option>
                <Option value="cyberpunk">Cyberpunk</Option>
                <Option value="forest">Forest</Option>
                <Option value="vintage">Vintage</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="fontSize" label={t('settings.fontSize')}>
              <Select>
                <Option value={12}>12px</Option>
                <Option value={14}>14px</Option>
                <Option value={16}>16px</Option>
                <Option value={18}>18px</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="language" label={t('settings.language')}>
              <Select>
                <Option value="zh">{t('language.zh')}</Option>
                <Option value="en">{t('language.en')}</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="autoSave" label={t('settings.autoSave')} valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item label={t('settings.vaultApi')} style={{ marginBottom: 8 }}>
          <Row gutter={16} align="middle">
            <Col>
              <Form.Item name="vaultApiEnabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </Col>
            <Col flex="auto">
              <Form.Item name="vaultApiPort" noStyle>
                <InputNumber min={1024} max={65535} style={{ width: 120 }} addonBefore="Port" />
              </Form.Item>
            </Col>
            <Col>
              <Form.Item name="mobileReaderEnabled" valuePropName="checked" noStyle>
                <Switch checkedChildren={t('settings.mobileReader')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16} align="middle" style={{ marginTop: 8 }}>
            <Col>
              <Form.Item name="vaultApiLanAccess" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </Col>
            <Col flex="auto">
              <span style={{ fontSize: 12, color: '#888' }}>{t('settings.vaultApiLanHint')}</span>
            </Col>
          </Row>

          {showMobileAccess && vaultApiLanAccess && (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255, 140, 40, 0.35)',
                background: 'rgba(255, 140, 40, 0.06)',
              }}
            >
              {vaultApiStatus?.running ? (
                <>
                  <Text type="success" style={{ display: 'block', fontSize: 12 }}>
                    {t('settings.vaultApiRunning', { port: vaultApiStatus.port })}
                  </Text>
                  {mobileLanUrls.length > 0 ? (
                    <>
                      {primaryMobileLanUrl && (
                        <div style={{ marginTop: 10, textAlign: 'center' }}>
                          <QRCode
                            value={primaryMobileLanUrl}
                            size={140}
                            bordered={false}
                            style={{ padding: 8, background: '#fff', borderRadius: 8 }}
                          />
                          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                            {t('settings.mobileReaderQrCaption')}
                          </div>
                        </div>
                      )}
                      {mobileLanUrls.map((url) => (
                        <div key={url} style={{ marginTop: 8 }}>
                          <Text copyable={{ text: url }} style={{ fontSize: 12, wordBreak: 'break-all' }}>
                            {t('settings.mobileReaderLanUrl', { url })}
                          </Text>
                        </div>
                      ))}
                      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                        {t('settings.mobileReaderLanHint')}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                        {t('settings.mobileReaderFirewallHint')}
                      </Paragraph>
                    </>
                  ) : (
                    <Text type="warning" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                      {t('settings.mobileReaderLanEmpty')}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text type="warning" style={{ display: 'block', fontSize: 12 }}>
                    {t('settings.vaultApiNotRunning')}
                  </Text>
                  {(vaultApiPending || lanAccessPending) && (
                    <Text type="warning" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                      {t('settings.mobileReaderLanPending')}
                    </Text>
                  )}
                  <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                    {t('settings.mobileReaderSaveToConnect')}
                  </Paragraph>
                </>
              )}
            </div>
          )}

          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {t('settings.vaultApiHint')}
            {showMobileAccess && vaultApiStatus?.running && mobileLocalUrl && (
              <span style={{ display: 'block', marginTop: 4 }}>
                <Text copyable={{ text: mobileLocalUrl }} style={{ fontSize: 12 }}>
                  {t('settings.mobileReaderUrl', { url: mobileLocalUrl })}
                </Text>
              </span>
            )}
          </Paragraph>
        </Form.Item>

        <Form.Item label={t('settings.mcpTitle')}>
          <Button onClick={() => setMcpOpen(true)}>
            {t('settings.manageMcp') || '管理 MCP 服务器'}
          </Button>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {t('settings.mcpHint')}
          </Paragraph>
        </Form.Item>

        <Form.Item label={t('settings.cliAgents') || 'AI CLI 安装'}>
          <Space wrap>
            <Button onClick={() => setCliInstallOpen(true)}>
              {t('settings.manageCliAgents') || '管理 CLI Agent'}
            </Button>
            <Button
              icon={<SyncOutlined />}
              loading={syncingSkills}
              onClick={() => void handleSyncSkills()}
            >
              {t('settings.syncCliSkills')}
            </Button>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {t('settings.cliAgentsHint') || '安装或卸载 Gemini、Claude、CodeBuddy 等 ACP CLI'}
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
            {t('settings.syncCliSkillsHint')}
          </Paragraph>
        </Form.Item>

        <Form.Item label={t('settings.ollama')}>
          <Row gutter={16} align="middle" style={{ marginBottom: 8 }}>
            <Col>
              <Form.Item name="ollamaEnabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </Col>
            <Col flex="auto">
              <Form.Item name="ollamaBaseUrl" noStyle>
                <Input placeholder="http://127.0.0.1:11434" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ollamaModel" label={t('settings.ollamaModel')} style={{ marginBottom: 0 }}>
            <Input placeholder="llama3.2" />
          </Form.Item>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {t('settings.ollamaHint')}
            {ollamaStatus?.running && (
              <Text type="success" style={{ display: 'block', marginTop: 4 }}>
                {t('settings.ollamaRunning', { count: ollamaStatus.models.length })}
              </Text>
            )}
          </Paragraph>
        </Form.Item>

        <Form.Item label={t('settings.calendar')}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="calendarIcsPath" noStyle>
              <Input placeholder={t('settings.calendarPlaceholder')} readOnly />
            </Form.Item>
            <Button icon={<FolderOpenOutlined />} onClick={handlePickCalendar}>
              {t('settings.calendarBrowse')}
            </Button>
          </Space.Compact>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {t('settings.calendarHint')}
          </Paragraph>
        </Form.Item>
      </Form>
      <CliInstallPanel open={cliInstallOpen} onClose={() => setCliInstallOpen(false)} />
      <McpSettingsPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />
    </Modal>
  )
}

export default SettingsModal
