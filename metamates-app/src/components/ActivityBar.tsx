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
import './ActivityBar.css'

interface ActivityBarItem {
  key: string
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
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
  const vaultIcon = 'activity-bar-icon activity-bar-icon--primary'
  const exploreIcon = 'activity-bar-icon activity-bar-icon--secondary'

  const items: ActivityBarItem[] = [
    {
      key: 'toggle',
      icon: fileTreeCollapsed
        ? <MenuUnfoldOutlined className={vaultIcon} />
        : <MenuFoldOutlined className={vaultIcon} />,
      label: fileTreeCollapsed ? t('sidebar:expand') : t('sidebar:collapse'),
      onClick: onToggleFileTree,
    },
    {
      key: 'workspace',
      icon: <FolderOpenOutlined className={vaultIcon} />,
      label: workspacePath ? t('sidebar:switchWorkspace') : t('sidebar:openWorkspace'),
      onClick: onOpenWorkspace,
    },
  ]

  const fileManagementItems: ActivityBarItem[] = [
    {
      key: 'newNote',
      icon: <FileAddOutlined className={vaultIcon} />,
      label: t('sidebar:newNote'),
      onClick: onCreateNote,
      disabled: !workspacePath,
    },
    {
      key: 'newFolder',
      icon: <FolderAddOutlined className={vaultIcon} />,
      label: t('sidebar:newFolder'),
      onClick: onCreateFolder,
      disabled: !workspacePath,
    },
    {
      key: 'template',
      icon: <FileTextOutlined className={vaultIcon} />,
      label: t('sidebar:useTemplate'),
      onClick: onOpenTemplate,
      disabled: !workspacePath,
    },
  ]

  const exploreItems: ActivityBarItem[] = [
    {
      key: 'commandPalette',
      icon: <CodeOutlined className={exploreIcon} />,
      label: t('commands:title'),
      onClick: onOpenCommandPalette,
    },
    {
      key: 'graph',
      icon: <ApartmentOutlined className={exploreIcon} />,
      label: t('graph:title'),
      onClick: onOpenGraph,
      disabled: !workspacePath,
    },
    {
      key: 'search',
      icon: <SearchOutlined className={exploreIcon} />,
      label: t('common:actions.search'),
      onClick: onOpenSearch,
    },
  ]

  const vaultGroup = fileTreeCollapsed
    ? items
    : [...items, ...fileManagementItems]

  const renderItem = (item: ActivityBarItem) => (
    <Tooltip key={item.key} title={item.label} placement="right">
      <button
        type="button"
        className={`activity-bar-item ${item.disabled ? 'disabled' : ''}`}
        data-testid={`activity-${item.key}`}
        aria-label={item.label}
        disabled={item.disabled}
        onClick={item.disabled ? undefined : item.onClick}
      >
        {item.icon}
      </button>
    </Tooltip>
  )

  return (
    <nav className="activity-bar" aria-label={t('common:app.name')}>
      <div className="activity-bar-top">
        {vaultGroup.map(renderItem)}
        <div className="activity-bar-divider" aria-hidden />
        {exploreItems.map(renderItem)}
      </div>
      <div className="activity-bar-bottom" />
    </nav>
  )
}

export default ActivityBar
