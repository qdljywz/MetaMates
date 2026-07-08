import React from 'react'
import { Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  FolderOpenOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import { useTheme } from '../hooks/useTheme'
import './ActivityBar.css'

interface ActivityBarItem {
  key: string
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  color?: string
}

interface ActivityBarProps {
  workspacePath: string | null
  onOpenWorkspace: () => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onOpenTemplate: () => void
  onOpenCommandPalette: () => void
  onOpenGraph: () => void
  onOpenSearch: () => void
  onToggleFileTree: () => void
  fileTreeCollapsed: boolean
}

const ActivityBar: React.FC<ActivityBarProps> = ({
  workspacePath,
  onOpenWorkspace,
  onCreateNote,
  onCreateFolder,
  onOpenTemplate,
  onOpenCommandPalette,
  onOpenGraph,
  onOpenSearch,
  onToggleFileTree,
  fileTreeCollapsed,
}) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const orange = isDark ? '#ff8c28' : '#ff7a00'
  const teal = isDark ? '#00d4c4' : '#00b4a6'

  const items: ActivityBarItem[] = [
    {
      key: 'toggle',
      icon: fileTreeCollapsed 
        ? <MenuUnfoldOutlined style={{ color: orange }} /> 
        : <MenuFoldOutlined style={{ color: orange }} />,
      label: fileTreeCollapsed ? t('sidebar:expand') : t('sidebar:collapse'),
      onClick: onToggleFileTree,
    },
    {
      key: 'workspace',
      icon: <FolderOpenOutlined style={{ color: orange }} />,
      label: workspacePath ? t('sidebar:switchWorkspace') : t('sidebar:openWorkspace'),
      onClick: onOpenWorkspace,
    },
  ]

  const fileManagementItems: ActivityBarItem[] = [
    {
      key: 'newNote',
      icon: <FileAddOutlined style={{ color: orange }} />,
      label: t('sidebar:newNote'),
      onClick: onCreateNote,
      disabled: !workspacePath,
    },
    {
      key: 'newFolder',
      icon: <FolderAddOutlined style={{ color: orange }} />,
      label: t('sidebar:newFolder'),
      onClick: onCreateFolder,
      disabled: !workspacePath,
    },
    {
      key: 'template',
      icon: <FileTextOutlined style={{ color: orange }} />,
      label: t('sidebar:useTemplate'),
      onClick: onOpenTemplate,
      disabled: !workspacePath,
    },
  ]

  const otherItems: ActivityBarItem[] = [
    {
      key: 'commandPalette',
      icon: <CodeOutlined style={{ color: teal }} />,
      label: t('commands:title'),
      onClick: onOpenCommandPalette,
    },
    {
      key: 'graph',
      icon: <ApartmentOutlined style={{ color: teal }} />,
      label: t('graph:title'),
      onClick: onOpenGraph,
      disabled: !workspacePath,
    },
    {
      key: 'search',
      icon: <SearchOutlined style={{ color: teal }} />,
      label: t('common:actions.search'),
      onClick: onOpenSearch,
    },
  ]

  const allItems = fileTreeCollapsed 
    ? [...items, ...otherItems]
    : [...items, ...fileManagementItems, ...otherItems]

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {allItems.map((item) => (
          <Tooltip key={item.key} title={item.label} placement="right">
            <div
              className={`activity-bar-item ${item.disabled ? 'disabled' : ''}`}
              data-testid={`activity-${item.key}`}
              onClick={item.disabled ? undefined : item.onClick}
            >
              {item.icon}
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="activity-bar-bottom">
      </div>
    </div>
  )
}

export default ActivityBar
