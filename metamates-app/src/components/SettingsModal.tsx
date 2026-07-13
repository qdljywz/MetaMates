import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Form, Select, Button, Switch, message, Row, Col, Typography, InputNumber, Input, Space, QRCode, Tabs } from 'antd'
import { FolderOpenOutlined, SyncOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { storageService } from '../services/storage'
import { hasCustomEngineDisplayName, isDefaultPartnerName, normalizeEngineDisplayName, validateCustomEngineDisplayName } from '../utils/engineDisplayName'
import { useTheme } from '../hooks/useTheme'
import { useAppContext } from '../store/AppContext'
import CliInstallPanel from './CliInstallPanel'
import McpSettingsPanel from './McpSettingsPanel'
import PluginSettingsPanel from './PluginSettingsPanel'
import AgentCliStatusPanel from './AgentCliStatusPanel'

const { Option } = Select
const { Text, Paragraph } = Typography

const COMMON_TIMEZONE_IDS = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Etc/UTC',
] as const

function buildTimezoneOptions(locale: string): Array<{ label: string; value: string }> {
  const displayLocale = locale.startsWith('zh') ? 'zh' : 'en'
  let display: Intl.DisplayNames | undefined
  try {
    display = new Intl.DisplayNames([displayLocale], { type: 'timeZone' as Intl.DisplayNamesType })
  } catch {
    display = undefined
  }
  return COMMON_TIMEZONE_IDS.map((value) => {
    const name = display?.of(value)
    return {
      value,
      label: name ? `${name} (${value})` : value,
    }
  })
}

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function SettingsSection({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="settings-section">
      {title ? <h3 className="settings-section__title">{title}</h3> : null}
      <div className="settings-section__body">{children}</div>
    </section>
  )
}

function SettingsHint({ children }: { children: React.ReactNode }) {
  return (
    <Paragraph type="secondary" className="settings-hint">
      {children}
    </Paragraph>
  )
}

interface SettingsModalProps {
  visible: boolean
  onClose: () => void
  initialTabKey?: 'general' | 'agent' | 'advanced'
  focusPluginId?: string
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  initialTabKey = 'general',
  focusPluginId,
}) => {
  const { t, i18n } = useTranslation('common')
  const { state, dispatch } = useAppContext()
  const { setThemeMode, setColorScheme, setLightPalette } = useTheme()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [vaultApiStatus, setVaultApiStatus] = useState<{ running: boolean; port: number } | null>(null)
  const [vaultLanToken, setVaultLanToken] = useState<string | null>(null)
  const [lanAddresses, setLanAddresses] = useState<string[]>([])
  const [ollamaStatus, setOllamaStatus] = useState<{ running: boolean; models: Array<{ name: string }> } | null>(null)
  const [cliInstallOpen, setCliInstallOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [syncingSkills, setSyncingSkills] = useState(false)
  const [activeTabKey, setActiveTabKey] = useState<'general' | 'agent' | 'advanced'>(initialTabKey)
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

  useEffect(() => {
    if (visible) setActiveTabKey(initialTabKey)
  }, [initialTabKey, visible])

  const loadSettings = async () => {
    const settings = await storageService.getSettings()
    form.setFieldsValue({
      theme: settings.theme || 'dark',
      colorScheme: (settings as any).colorScheme || 'default',
      lightPalette: settings.lightPalette === 'cold' ? 'cold' : 'paper',
      fontSize: settings.fontSize || 14,
      autoSave: settings.autoSave !== false,
      language: settings.language || 'zh',
      userTimezone: settings.userTimezone || 'Asia/Shanghai',
      vaultApiEnabled: settings.vaultApiEnabled || false,
      vaultApiPort: settings.vaultApiPort || 17333,
      vaultApiLanAccess: settings.vaultApiLanAccess || false,
      calendarIcsPath: settings.calendarIcsPath || '',
      ollamaEnabled: settings.ollamaEnabled || false,
      ollamaBaseUrl: settings.ollamaBaseUrl || 'http://127.0.0.1:11434',
      ollamaModel: settings.ollamaModel || 'llama3.2',
      mobileReaderEnabled: settings.mobileReaderEnabled !== false,
      speechEngine: settings.speechEngine || 'auto',
      engineDisplayName: settings.engineDisplayName || '',
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
          setVaultLanToken(result.lanToken || null)
        } else {
          setVaultApiStatus({ running: false, port: settings.vaultApiPort || 17333 })
          setVaultLanToken(null)
          message.warning(t('settings.vaultApiStartFailed') + ': ' + result.error)
        }
      } else {
        const status = await window.electronAPI.vaultApi.getStatus()
        setVaultApiStatus({ running: status.running, port: status.port || settings.vaultApiPort || 17333 })
        setVaultLanToken(status.lanToken || null)
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

  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(i18n.language),
    [i18n.language]
  )

  const appendVaultToken = (url: string) => {
    if (!vaultLanToken || !url) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}token=${encodeURIComponent(vaultLanToken)}`
  }

  const mobileLanUrls = useMemo(() => {
    if (!vaultApiLanAccess || !showMobileReader || !vaultApiEnabled) return []
    return lanAddresses.map((ip) => appendVaultToken(`http://${ip}:${effectivePort}/mobile`))
  }, [vaultApiLanAccess, showMobileReader, vaultApiEnabled, lanAddresses, effectivePort, vaultLanToken])

  const primaryMobileLanUrl = mobileLanUrls[0] || ''
  const lanAccessPending = vaultApiLanAccess !== agentSnapshot.vaultApiLanAccess
  const vaultApiPending = vaultApiEnabled !== agentSnapshot.vaultApiEnabled
  const showMobileAccess = vaultApiEnabled && showMobileReader

  const handleSave = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()
      const normalizedTimezone = String(values.userTimezone || '').trim()
      const saveData: any = {
        theme: values.theme,
        fontSize: values.fontSize,
        autoSave: values.autoSave,
        language: values.language,
        userTimezone: normalizedTimezone || 'Asia/Shanghai',
        vaultApiEnabled: values.vaultApiEnabled,
        vaultApiPort: values.vaultApiPort || 17333,
        vaultApiLanAccess: values.vaultApiLanAccess || false,
        calendarIcsPath: values.calendarIcsPath || '',
        ollamaEnabled: values.ollamaEnabled,
        ollamaBaseUrl: values.ollamaBaseUrl || 'http://127.0.0.1:11434',
        ollamaModel: values.ollamaModel || 'llama3.2',
        mobileReaderEnabled: values.mobileReaderEnabled !== false,
        speechEngine: values.speechEngine || 'auto',
      }
      if (values.colorScheme) saveData.colorScheme = values.colorScheme
      if (values.lightPalette) saveData.lightPalette = values.lightPalette

      const engineTrimmed = normalizeEngineDisplayName(String(values.engineDisplayName ?? ''))
      if (!engineTrimmed || isDefaultPartnerName(engineTrimmed)) {
        saveData.engineDisplayName = undefined
      } else {
        const validated = validateCustomEngineDisplayName(engineTrimmed)
        if (!validated.ok) {
          message.warning(
            validated.reason === 'default'
              ? t('settings.engineDisplayNameIsDefault')
              : t('settings.engineDisplayNameInvalid'),
          )
          return
        }
        saveData.engineDisplayName = validated.name
      }

      const hadCustomPartnerName = hasCustomEngineDisplayName(state.settings)

      await storageService.saveSettings(saveData)
      if (window.electronAPI?.saveSettings) {
        await window.electronAPI.saveSettings(saveData)
      }
      dispatch({ type: 'UPDATE_SETTINGS', payload: saveData })

      const hasCustomPartnerName = hasCustomEngineDisplayName({
        engineDisplayName: saveData.engineDisplayName,
      })
      if (hadCustomPartnerName !== hasCustomPartnerName) {
        window.dispatchEvent(new CustomEvent('metamates:engine-name-updated'))
        window.dispatchEvent(new CustomEvent('metamates:empty-state-force-refresh'))
      }

      if (values.theme) setThemeMode(values.theme as 'light' | 'dark' | 'system')
      if (values.colorScheme) setColorScheme(values.colorScheme as 'default' | 'nordic' | 'cyberpunk' | 'forest' | 'vintage')
      if (values.lightPalette) setLightPalette(values.lightPalette as 'paper' | 'cold')
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
        message.info(t('settings.mcpReconnectHint'))
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
      width={580}
      className="settings-modal"
      data-testid="settings-modal"
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingTop: 4 } }}
      footer={[
        <Button key="cancel" className="settings-modal__cancel" onClick={onClose}>
          {t('settings.cancel')}
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={loading}>
          {t('settings.save')}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" size="small">
        <Tabs
          className="settings-modal__tabs"
          activeKey={activeTabKey}
          onChange={(key) => setActiveTabKey(key as 'general' | 'agent' | 'advanced')}
          items={[
            {
              key: 'general',
              label: t('settings.tabGeneral'),
              children: (
                <div className="settings-tab-panel">
        <SettingsSection title={t('settings.appearance')}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="theme" label={t('settings.theme')}>
              <Select
                options={[
                  { value: 'dark', label: t('settings.dark') },
                  { value: 'light', label: t('settings.light') },
                  { value: 'system', label: t('settings.system') },
                ]}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.theme !== cur.theme}>
              {({ getFieldValue }) => {
                const theme = getFieldValue('theme') as string
                const systemHint = theme === 'system' ? t('settings.systemHint') : null
                return (
                  <>
                    {systemHint ? <SettingsHint>{systemHint}</SettingsHint> : null}
                    <SettingsHint>{t('settings.themeShortcutHint')}</SettingsHint>
                  </>
                )
              }}
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.theme !== cur.theme}>
              {({ getFieldValue }) => {
                const theme = getFieldValue('theme') as string
                if (theme === 'dark') return null
                return (
                  <Form.Item name="lightPalette" label={t('settings.lightPalette')}>
                    <Select
                      options={[
                        { value: 'paper', label: t('settings.lightPalettePaper') },
                        { value: 'cold', label: t('settings.lightPaletteCold') },
                      ]}
                    />
                  </Form.Item>
                )
              }}
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.theme !== cur.theme || prev.lightPalette !== cur.lightPalette}>
              {({ getFieldValue }) => {
                const theme = getFieldValue('theme') as string
                if (theme === 'dark') return null
                const palette = getFieldValue('lightPalette') as string
                const hint = palette === 'cold'
                  ? t('settings.lightPaletteColdHint')
                  : t('settings.lightPalettePaperHint')
                return (
                  <SettingsHint>{hint}</SettingsHint>
                )
              }}
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="colorScheme" label={t('settings.colorScheme')}>
              <Select>
                <Option value="default">{t('settings.colorSchemeDefault')}</Option>
                <Option value="nordic">{t('settings.colorSchemeNordic')}</Option>
                <Option value="cyberpunk">{t('settings.colorSchemeCyberpunk')}</Option>
                <Option value="forest">{t('settings.colorSchemeForest')}</Option>
                <Option value="vintage">{t('settings.colorSchemeVintage')}</Option>
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
        </Row>
        </SettingsSection>

        <SettingsSection title={t('settings.sectionLanguageTime')}>
        <Form.Item name="language" label={t('settings.language')}>
          <Select>
            <Option value="zh">{t('language.zh')}</Option>
            <Option value="en">{t('language.en')}</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="userTimezone"
          label={t('settings.timezone')}
          rules={[
            { required: true, message: t('settings.timezoneRequired') },
            {
              validator: async (_, value: string) => {
                if (!value?.trim()) return Promise.reject(new Error(t('settings.timezoneRequired')))
                if (!isValidTimezone(value.trim())) {
                  return Promise.reject(new Error(t('settings.timezoneInvalid')))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Select
            showSearch
            options={timezoneOptions}
            placeholder="Asia/Shanghai"
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase()) ||
              String(option?.value ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <SettingsHint>{t('settings.timezoneHint')}</SettingsHint>
        </SettingsSection>

        <SettingsSection title={t('settings.sectionInputBehavior')}>
        <Form.Item name="speechEngine" label={t('settings.speechEngine')}>
          <Select>
            <Option value="auto">{t('settings.speechEngineAuto')}</Option>
            <Option value="whisper">{t('settings.speechEngineWhisper')}</Option>
            <Option value="native">{t('settings.speechEngineNative')}</Option>
            <Option value="web">{t('settings.speechEngineWeb')}</Option>
          </Select>
        </Form.Item>
        <SettingsHint>{t('settings.speechEngineHint')}</SettingsHint>

        <Form.Item name="autoSave" label={t('settings.autoSave')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <SettingsHint>{t('settings.autoSaveHint')}</SettingsHint>
        </SettingsSection>
                </div>
              ),
            },
            {
              key: 'agent',
              label: t('settings.tabAgent'),
              children: (
                <div data-testid="settings-agent-tab" className="settings-tab-panel">
        <SettingsSection title={t('settings.engineDisplayName')}>
        <Form.Item name="engineDisplayName">
          <Input
            maxLength={12}
            placeholder={t('settings.engineDisplayNamePlaceholder')}
            allowClear
          />
        </Form.Item>
        <SettingsHint>{t('settings.engineDisplayNameHint')}</SettingsHint>
        </SettingsSection>

        <SettingsSection title={t('settings.vaultApi')}>
          <Row gutter={16} align="middle">
            <Col>
              <Form.Item name="vaultApiEnabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </Col>
            <Col flex="auto">
              <Form.Item name="vaultApiPort" noStyle>
                <InputNumber min={1024} max={65535} style={{ width: 120 }} addonBefore={t('settings.vaultApiPort')} />
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
              <Text type="secondary" style={{ fontSize: 12 }}>{t('settings.vaultApiLanHint')}</Text>
            </Col>
          </Row>

          {showMobileAccess && vaultApiLanAccess && (
            <div className="settings-vault-callout">
              {vaultApiStatus?.running ? (
                <>
                  <Text type="success" style={{ display: 'block', fontSize: 12 }}>
                    {t('settings.vaultApiRunning', { port: vaultApiStatus.port })}
                  </Text>
                  {mobileLanUrls.length > 0 ? (
                    <>
                      {primaryMobileLanUrl && (
                        <div style={{ marginTop: 10, textAlign: 'center' }}>
                          <div className="settings-qr-wrap">
                            <QRCode
                              value={primaryMobileLanUrl}
                              size={140}
                              bordered={false}
                              color="#000000"
                              bgColor="#ffffff"
                            />
                          </div>
                          <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                            {t('settings.mobileReaderQrCaption')}
                          </Text>
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

          <Paragraph type="secondary" className="settings-hint settings-hint--tight">
            {t('settings.vaultApiHint')}
            {showMobileAccess && vaultApiStatus?.running && mobileLocalUrl && (
              <span style={{ display: 'block', marginTop: 4 }}>
                <Text copyable={{ text: mobileLocalUrl }} style={{ fontSize: 12 }}>
                  {t('settings.mobileReaderUrl', { url: mobileLocalUrl })}
                </Text>
              </span>
            )}
          </Paragraph>
        </SettingsSection>

        <SettingsSection title={t('settings.mcpTitle')}>
          <Button onClick={() => setMcpOpen(true)}>
            {t('settings.manageMcp')}
          </Button>
          <SettingsHint>{t('settings.mcpHint')}</SettingsHint>
        </SettingsSection>

        <SettingsSection title={t('settings.pluginsTitle')}>
          <PluginSettingsPanel focusPluginId={focusPluginId} />
        </SettingsSection>

        <SettingsSection title={t('settings.cliAgents')}>
          <AgentCliStatusPanel />
          <Space wrap style={{ marginTop: 12 }}>
            <Button onClick={() => setCliInstallOpen(true)}>
              {t('settings.manageCliAgents')}
            </Button>
            <Button
              icon={<SyncOutlined />}
              loading={syncingSkills}
              onClick={() => void handleSyncSkills()}
            >
              {t('settings.syncCliSkills')}
            </Button>
          </Space>
          <SettingsHint>{t('settings.cliAgentsHint')}</SettingsHint>
          <SettingsHint>{t('settings.syncCliSkillsHint')}</SettingsHint>
        </SettingsSection>

        <SettingsSection title={t('settings.ollama')}>
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
          <Form.Item name="ollamaModel" label={t('settings.ollamaModel')}>
            <Input placeholder="llama3.2" />
          </Form.Item>
          <SettingsHint>
            {t('settings.ollamaHint')}
            {ollamaStatus?.running && (
              <Text type="success" style={{ display: 'block', marginTop: 4 }}>
                {t('settings.ollamaRunning', { count: ollamaStatus.models.length })}
              </Text>
            )}
          </SettingsHint>
        </SettingsSection>
                </div>
              ),
            },
            {
              key: 'advanced',
              label: t('settings.tabAdvanced'),
              children: (
                <div className="settings-tab-panel">
        <SettingsSection title={t('settings.calendar')}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="calendarIcsPath" noStyle>
              <Input placeholder={t('settings.calendarPlaceholder')} readOnly />
            </Form.Item>
            <Button icon={<FolderOpenOutlined />} onClick={handlePickCalendar}>
              {t('settings.calendarBrowse')}
            </Button>
          </Space.Compact>
          <SettingsHint>{t('settings.calendarHint')}</SettingsHint>
        </SettingsSection>
                </div>
              ),
            },
          ]}
        />
      </Form>
      <CliInstallPanel open={cliInstallOpen} onClose={() => setCliInstallOpen(false)} />
      <McpSettingsPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />
    </Modal>
  )
}

export default SettingsModal
