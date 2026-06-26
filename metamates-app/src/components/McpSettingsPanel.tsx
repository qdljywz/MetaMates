import React, { useCallback, useEffect, useState } from 'react'
import { Modal, Table, Button, Form, Input, Switch, Space, message, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { UserMcpServer } from '../types/mcp'
import { storageService } from '../services/storage'

interface McpSettingsPanelProps {
  open: boolean
  onClose: () => void
}

function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

function formatEnvLines(env?: Record<string, string>): string {
  if (!env) return ''
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')
}

const McpSettingsPanel: React.FC<McpSettingsPanelProps> = ({ open, onClose }) => {
  const { t } = useTranslation('common')
  const [servers, setServers] = useState<UserMcpServer[]>([])
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<UserMcpServer | null>(null)
  const [form] = Form.useForm()

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      if (window.electronAPI?.acp?.getMcpServersConfig) {
        const list = await window.electronAPI.acp.getMcpServersConfig()
        setServers(list as UserMcpServer[])
        return
      }
      const settings = await storageService.getSettings()
      const electronSettings = await window.electronAPI?.getSettings?.()
      const merged = { ...settings, ...(electronSettings || {}) }
      let list = ((merged as any).mcpServers || []).filter((s: any) => !s.builtin)
      if ((merged as any).vaultApiEnabled) {
        const port = (merged as any).vaultApiPort || 17333
        list = [{
          id: 'metamates-vault',
          name: 'Metamates Vault',
          enabled: true,
          command: 'node',
          args: ['scripts/vault-mcp-bridge.mjs'],
          env: { VAULT_API_URL: `http://127.0.0.1:${port}` },
          builtin: true,
        }, ...list]
      }
      setServers(list)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadServers()
  }, [open, loadServers])

  const persist = async (next: UserMcpServer[]) => {
    const toSave = next.filter(s => !s.builtin)
    setServers(next)
    await storageService.saveSettings({ mcpServers: toSave } as any)
    await window.electronAPI?.saveSettings?.({ mcpServers: toSave })
    if (window.electronAPI?.acp?.reloadSessions) {
      const result = await window.electronAPI.acp.reloadSessions()
      const ok = result.results.filter(r => r.success).length
      const fail = result.results.filter(r => !r.success).length
      if (fail === 0 && ok > 0) {
        message.success(t('settings.mcpReconnectDone') || `已重载 ${ok} 个 Agent 会话`)
      } else if (ok > 0) {
        message.warning(t('settings.mcpReconnectPartial') || `部分 Agent 重载成功 (${ok}/${ok + fail})`)
      } else {
        message.info(t('settings.mcpReconnectHint') || 'MCP 已保存；下次连接 Agent 时生效')
      }
    } else {
      message.success(t('settings.savedSuccess'))
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    const next = servers.map(s => (s.id === id ? { ...s, enabled } : s))
    await persist(next)
  }

  const handleDelete = async (id: string) => {
    const next = servers.filter(s => s.id !== id)
    await persist(next)
    message.success(t('settings.mcpDeleted') || '已删除')
  }

  const openEditor = (server?: UserMcpServer) => {
    setEditing(server || null)
    form.setFieldsValue({
      name: server?.name || '',
      command: server?.command || '',
      args: (server?.args || []).join(' '),
      env: formatEnvLines(server?.env),
      enabled: server?.enabled !== false,
    })
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    const values = await form.validateFields()
    const args = values.args
      ? values.args.split(/\s+/).filter(Boolean)
      : []
    const env = parseEnvLines(values.env || '')
    const payload: UserMcpServer = {
      id: editing?.id || `mcp-${Date.now()}`,
      name: values.name.trim(),
      command: values.command.trim(),
      args,
      env: Object.keys(env).length ? env : undefined,
      enabled: values.enabled !== false,
      builtin: editing?.builtin,
    }
    const next = editing
      ? servers.map(s => (s.id === editing.id ? payload : s))
      : [...servers, payload]
    await persist(next)
    setEditOpen(false)
    setEditing(null)
    message.success(t('settings.savedSuccess'))
  }

  const columns = [
    {
      title: t('settings.mcpName') || '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: UserMcpServer) => (
        <Space>
          {name}
          {row.builtin && <Tag color="blue">builtin</Tag>}
        </Space>
      ),
    },
    {
      title: t('settings.mcpCommand') || '命令',
      dataIndex: 'command',
      key: 'command',
      ellipsis: true,
    },
    {
      title: t('settings.mcpEnabled') || '启用',
      key: 'enabled',
      width: 80,
      render: (_: unknown, row: UserMcpServer) => (
        <Switch
          checked={row.enabled}
          disabled={row.builtin}
          onChange={(v) => handleToggle(row.id, v)}
        />
      ),
    },
    {
      title: t('settings.actions') || '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, row: UserMcpServer) =>
        row.builtin ? null : (
          <Space>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditor(row)} />
            <Popconfirm title={t('settings.mcpDeleteConfirm') || '确认删除？'} onConfirm={() => handleDelete(row.id)}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
    },
  ]

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        title={t('settings.mcpTitle') || 'MCP 服务器'}
        width={720}
        footer={[
          <Button key="add" type="dashed" icon={<PlusOutlined />} onClick={() => openEditor()}>
            {t('settings.mcpAdd') || '添加 MCP'}
          </Button>,
          <Button key="close" onClick={onClose}>
            {t('settings.cancel')}
          </Button>,
        ]}
      >
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          {t('settings.mcpHint') || '启用的 MCP 会在 ACP session/new 时注入。Vault 桥接在 Vault API 开启时自动加入。'}
        </p>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={servers}
          columns={columns}
          pagination={false}
        />
      </Modal>

      <Modal
        open={editOpen}
        title={editing ? (t('settings.mcpEdit') || '编辑 MCP') : (t('settings.mcpAdd') || '添加 MCP')}
        onCancel={() => { setEditOpen(false); setEditing(null) }}
        onOk={handleSaveEdit}
        okText={t('settings.save')}
        cancelText={t('settings.cancel')}
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label={t('settings.mcpName') || '名称'} rules={[{ required: true }]}>
            <Input placeholder="my-mcp-server" />
          </Form.Item>
          <Form.Item name="command" label={t('settings.mcpCommand') || '命令'} rules={[{ required: true }]}>
            <Input placeholder="npx" />
          </Form.Item>
          <Form.Item name="args" label={t('settings.mcpArgs') || '参数（空格分隔）'}>
            <Input placeholder="-y @modelcontextprotocol/server-filesystem /path" />
          </Form.Item>
          <Form.Item name="env" label={t('settings.mcpEnv') || '环境变量（KEY=VALUE 每行）'}>
            <Input.TextArea rows={3} placeholder="API_KEY=xxx" />
          </Form.Item>
          <Form.Item name="enabled" label={t('settings.mcpEnabled') || '启用'} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default McpSettingsPanel
