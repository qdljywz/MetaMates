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
  FolderOpenOutlined,
  ImportOutlined,
} from '@ant-design/icons'

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
  onSwitchWorkspace: () => void
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
  onSwitchWorkspace,
}) => {
  const { t } = useTranslation('commands')
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
      icon: <CalendarOutlined style={{ color: 'var(--accent)' }} />,
      category: 'command',
      action: onCreateDailyNote,
      keywords: ['daily', 'today', 'note', 'diary'],
    },
    {
      id: 'daily-plan',
      label: t('commands.dailyPlan.label'),
      description: t('commands.dailyPlan.description'),
      icon: <CalendarOutlined style={{ color: 'var(--accent)' }} />,
      category: 'command',
      action: onCreateDailyPlan,
      keywords: ['daily', 'today', 'plan'],
    },
    {
      id: 'new-file',
      label: t('commands.newFile.label'),
      description: t('commands.newFile.description'),
      icon: <FileAddOutlined style={{ color: 'var(--accent)' }} />,
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
      icon: <ImportOutlined style={{ color: 'var(--accent)' }} />,
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
      icon: <TagOutlined style={{ color: 'var(--accent)' }} />,
      category: 'navigation',
      action: onShowTags,
      keywords: ['tag'],
    },
    {
      id: 'show-graph',
      label: t('commands.showGraph.label'),
      description: t('commands.showGraph.description'),
      icon: <LinkOutlined style={{ color: 'var(--accent)' }} />,
      category: 'navigation',
      action: onShowGraph,
      keywords: ['graph', 'relation'],
    },
    {
      id: 'switch-workspace',
      label: t('commands.switchWorkspace.label'),
      description: t('commands.switchWorkspace.description'),
      icon: <FolderOpenOutlined style={{ color: 'var(--accent)' }} />,
      category: 'command',
      action: () => {
        onSwitchWorkspace()
        onClose()
      },
      keywords: ['workspace', 'folder', 'vault', 'switch', 'open', '工作区', '切换', '文件夹'],
    },
    {
      id: 'settings',
      label: t('commands.settings.label'),
      description: t('commands.settings.description'),
      icon: <SettingOutlined style={{ color: 'var(--text-muted)' }} />,
      category: 'command',
      action: onOpenSettings,
      keywords: ['settings', 'config'],
    },
  ], [onCreateDailyNote, onCreateDailyPlan, onImportIntelligence, onShowTags, onShowGraph, onOpenSettings, onSwitchWorkspace, onClose, t])

  const filteredItems = useMemo(() => {
    if (newFileMode) return []

    const lowerSearch = search.toLowerCase()
    const commandSearch = search.startsWith('>') ? search.slice(1).trim().toLowerCase() : lowerSearch
    
    const matchedFiles = files
      .filter(f => f.name.toLowerCase().includes(lowerSearch))
      .map(f => ({
        id: `file-${f.path}`,
        label: f.name,
        description: f.path,
        icon: <FileTextOutlined style={{ color: 'var(--accent)' }} />,
        category: 'file' as const,
        action: () => onFileSelect(f.path),
      }))
    
    const matchedCommands = commands.filter((cmd) => {
      if (search.startsWith('>')) {
        if (!commandSearch) return true
        const matchLabel = cmd.label.toLowerCase().includes(commandSearch)
        const matchKeywords = cmd.keywords?.some((k) => k.includes(commandSearch)) || false
        return matchLabel || matchKeywords
      }
      const matchLabel = cmd.label.toLowerCase().includes(lowerSearch)
      const matchKeywords = cmd.keywords?.some((k) => k.includes(lowerSearch)) || false
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

  const runCommand = useCallback((item: CommandItem) => {
    item.action()
    if (item.id !== 'new-file') onClose()
  }, [onClose])

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
          runCommand(filteredItems[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredItems, selectedIndex, onClose, newFileMode, handleConfirmNewFile, runCommand])

  const getCategoryTagClass = () => 'mm-tag mm-tag--accent'

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
            <Text strong style={{ display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
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
              prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{ marginBottom: 8 }}
            />
            
            <div style={{ maxHeight: 400, overflow: 'auto' }} role="listbox" aria-label={t('searchPlaceholder')}>
              {filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  <SearchOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                  <div>{t('noMatch')}</div>
                </div>
              ) : (
                <List
                  dataSource={filteredItems}
                  renderItem={(item, index) => (
                    <div
                      role="option"
                      aria-selected={index === selectedIndex}
                      id={`command-palette-option-${index}`}
                      onClick={() => runCommand(item)}
                      className={`command-palette-item${index === selectedIndex ? ' command-palette-item--selected' : ''}`}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {item.icon}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text strong>{item.label}</Text>
                          <Tag className={getCategoryTagClass()} style={{ fontSize: 10, padding: '0 4px' }}>
                            {getCategoryLabel(item.category)}
                          </Tag>
                        </div>
                        {item.description && (
                          <Text className="command-palette-item__desc" style={{ fontSize: 12 }}>
                            {item.description}
                          </Text>
                        )}
                      </div>
                    </div>
                  )}
                />
              )}
            </div>
            
            <div className="command-palette-hints" style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11 }}>
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
