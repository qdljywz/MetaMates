import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal, Input, List, Tag, Typography, Button, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import { 
  FileTextOutlined, 
  SearchOutlined, 
  FileAddOutlined,
  SettingOutlined,
  TagOutlined,
  LinkOutlined,
  CalendarOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import { useTheme } from '../hooks/useTheme'

const { Text } = Typography

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  category: 'file' | 'command' | 'navigation'
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  visible: boolean
  onClose: () => void
  files: { name: string; path: string }[]
  onFileSelect: (path: string) => void
  onCreateFile: (name: string) => void
  onShowTags: () => void
  onShowGraph: () => void
  onCreateDailyNote: () => void
  onCreateDailyPlan: () => void
  onOpenSettings: () => void
  onImportIntelligence: () => void
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  visible,
  onClose,
  files,
  onFileSelect,
  onCreateFile,
  onShowTags,
  onShowGraph,
  onCreateDailyNote,
  onCreateDailyPlan,
  onOpenSettings,
  onImportIntelligence,
}) => {
  const { t } = useTranslation('commands')
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [newFileMode, setNewFileMode] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  const handleConfirmNewFile = useCallback(() => {
    onCreateFile(newFileName.trim())
    setNewFileMode(false)
    setNewFileName('')
    onClose()
  }, [newFileName, onCreateFile, onClose])

  const commands = useMemo<CommandItem[]>(() => [
    {
      id: 'daily-note',
      label: t('commands.dailyNote.label'),
      description: t('commands.dailyNote.description'),
      icon: <CalendarOutlined style={{ color: '#52c41a' }} />,
      category: 'command',
      action: onCreateDailyNote,
      keywords: ['daily', 'today', 'note', 'diary'],
    },
    {
      id: 'daily-plan',
      label: t('commands.dailyPlan.label'),
      description: t('commands.dailyPlan.description'),
      icon: <CalendarOutlined style={{ color: '#3b82f6' }} />,
      category: 'command',
      action: onCreateDailyPlan,
      keywords: ['daily', 'today', 'plan'],
    },
    {
      id: 'new-file',
      label: t('commands.newFile.label'),
      description: t('commands.newFile.description'),
      icon: <FileAddOutlined style={{ color: '#1890ff' }} />,
      category: 'command',
      action: () => {
        setNewFileMode(true)
        setNewFileName('')
      },
      keywords: ['new', 'create'],
    },
    {
      id: 'import-intelligence',
      label: t('commands.importIntelligence.label'),
      description: t('commands.importIntelligence.description'),
      icon: <ImportOutlined style={{ color: '#722ed1' }} />,
      category: 'command',
      action: () => {
        onImportIntelligence()
        onClose()
      },
      keywords: ['import', 'intel', 'pdf', 'document', '情报', '导入'],
    },
    {
      id: 'show-tags',
      label: t('commands.showTags.label'),
      description: t('commands.showTags.description'),
      icon: <TagOutlined style={{ color: '#fa8c16' }} />,
      category: 'navigation',
      action: onShowTags,
      keywords: ['tag'],
    },
    {
      id: 'show-graph',
      label: t('commands.showGraph.label'),
      description: t('commands.showGraph.description'),
      icon: <LinkOutlined style={{ color: '#13c2c2' }} />,
      category: 'navigation',
      action: onShowGraph,
      keywords: ['graph', 'relation'],
    },
    {
      id: 'settings',
      label: t('commands.settings.label'),
      description: t('commands.settings.description'),
      icon: <SettingOutlined style={{ color: '#8c8c8c' }} />,
      category: 'command',
      action: onOpenSettings,
      keywords: ['settings', 'config'],
    },
  ], [onCreateDailyNote, onCreateDailyPlan, onImportIntelligence, onShowTags, onShowGraph, onOpenSettings, onClose, t])

  const filteredItems = useMemo(() => {
    if (newFileMode) return []

    const lowerSearch = search.toLowerCase()
    
    const matchedFiles = files
      .filter(f => f.name.toLowerCase().includes(lowerSearch))
      .map(f => ({
        id: `file-${f.path}`,
        label: f.name,
        description: f.path,
        icon: <FileTextOutlined style={{ color: '#52c41a' }} />,
        category: 'file' as const,
        action: () => onFileSelect(f.path),
      }))
    
    const matchedCommands = commands.filter(cmd => {
      const matchLabel = cmd.label.toLowerCase().includes(lowerSearch)
      const matchKeywords = cmd.keywords?.some(k => k.includes(lowerSearch)) || false
      return matchLabel || matchKeywords
    })
    
    if (search.startsWith('>')) {
      return matchedCommands
    }
    
    if (search.startsWith('#')) {
      return matchedCommands.filter(c => c.id === 'show-tags')
    }
    
    return [...matchedFiles, ...matchedCommands]
  }, [search, files, commands, onFileSelect, newFileMode])

  useEffect(() => {
    setSelectedIndex(0)
  }, [search, newFileMode])

  useEffect(() => {
    if (!visible) {
      setSearch('')
      setSelectedIndex(0)
      setNewFileMode(false)
      setNewFileName('')
    }
  }, [visible])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (newFileMode) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setNewFileMode(false)
        setNewFileName('')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleConfirmNewFile()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action()
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredItems, selectedIndex, onClose, newFileMode, handleConfirmNewFile])

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      file: 'green',
      command: 'blue',
      navigation: 'cyan',
    }
    return colors[category] || 'default'
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      file: t('categories.file'),
      command: t('categories.command'),
      navigation: t('categories.navigation'),
    }
    return labels[category] || category
  }

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      style={{ top: 100 }}
      styles={{ body: { padding: 0 } }}
      title={null}
      closable={false}
      maskClosable
      destroyOnClose
    >
      <div style={{ padding: '12px' }}>
        {newFileMode ? (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8, color: isDark ? '#e6e6e6' : undefined }}>
              {t('commands.newFile.label')}
            </Text>
            <Input
              placeholder={t('commands.newFile.placeholder')}
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{ marginBottom: 8 }}
            />
            <Space>
              <Button type="primary" onClick={handleConfirmNewFile}>
                {t('commands.newFile.create')}
              </Button>
              <Button onClick={() => { setNewFileMode(false); setNewFileName('') }}>
                {t('commands.newFile.cancel')}
              </Button>
            </Space>
          </div>
        ) : (
          <>
            <Input
              prefix={<SearchOutlined style={{ color: isDark ? '#a6adc8' : '#888' }} />}
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{ marginBottom: 8 }}
            />
            
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: isDark ? '#a6adc8' : '#888' }}>
                  <SearchOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                  <div>{t('noMatch')}</div>
                </div>
              ) : (
                <List
                  dataSource={filteredItems}
                  renderItem={(item, index) => (
                    <div
                      onClick={() => {
                        item.action()
                        onClose()
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: index === selectedIndex 
                          ? (isDark ? 'rgba(38, 99, 235, 0.3)' : 'rgba(24, 144, 255, 0.1)') 
                          : 'transparent',
                        borderRadius: 4,
                        marginBottom: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {item.icon}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text strong style={{ color: isDark ? '#e6e6e6' : 'inherit' }}>{item.label}</Text>
                          <Tag color={getCategoryColor(item.category)} style={{ fontSize: 10, padding: '0 4px' }}>
                            {getCategoryLabel(item.category)}
                          </Tag>
                        </div>
                        {item.description && (
                          <Text type="secondary" style={{ fontSize: 12, color: isDark ? '#a6adc8' : undefined }}>
                            {item.description}
                          </Text>
                        )}
                      </div>
                    </div>
                  )}
                />
              )}
            </div>
            
            <div style={{ marginTop: 8, display: 'flex', gap: 16, color: isDark ? '#a6adc8' : '#888', fontSize: 11 }}>
              <span>{t('navigation.upDown')}</span>
              <span>{t('navigation.enter')}</span>
              <span>{t('navigation.esc')}</span>
              <span>{t('navigation.commandMode')}</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default CommandPalette
