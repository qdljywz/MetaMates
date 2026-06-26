import React from 'react'
import { Button, Tooltip } from 'antd'
import { CloseOutlined, FileOutlined, FolderOutlined } from '@ant-design/icons'
import { useAppContext } from '../store/AppContext'
import type { OpenTab } from '../store/appStore'
import { useTheme } from '../hooks/useTheme'

const TabBar: React.FC = () => {
  const { state, dispatch } = useAppContext()
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'

  const handleTabClick = (path: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: path })
  }

  const handleTabClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    dispatch({ type: 'CLOSE_TAB', payload: path })
  }

  if (state.openTabs.length === 0) {
    return null
  }

  return (
    <div 
      className="tab-bar"
      style={{ 
        display: 'flex',
        background: isDark ? '#181825' : '#f5f5f5',
        borderBottom: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
        padding: '4px 8px 0',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {state.openTabs.map((tab: OpenTab) => {
        const isActive = tab.path === state.currentFile
        const isFolder = !tab.path.endsWith('.md')
        
        return (
          <div
            key={tab.path}
            onClick={() => handleTabClick(tab.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              marginRight: '2px',
              background: isActive ? (isDark ? '#1e1e2e' : '#ffffff') : (isDark ? '#11111b' : '#e5e7eb'),
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              border: isActive ? `1px solid ${isDark ? '#313244' : '#e5e7eb'}` : '1px solid transparent',
              borderBottom: isActive ? (isDark ? '1px solid #1e1e2e' : '1px solid #ffffff') : 'none',
              marginBottom: '-1px',
              minWidth: '100px',
              maxWidth: '200px',
              transition: 'all 0.2s',
            }}
          >
            {isFolder ? (
              <FolderOutlined style={{ marginRight: 6, color: '#f59e0b' }} />
            ) : (
              <FileOutlined style={{ marginRight: 6, color: '#3b82f6' }} />
            )}
            <Tooltip title={tab.name} placement="bottom">
              <span 
                style={{ 
                  flex: 1, 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  color: isDark ? '#e6e6e6' : '#1f2937',
                }}
              >
                {tab.name}
              </span>
            </Tooltip>
            {tab.isDirty && (
              <span 
                style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  background: '#3b82f6',
                  marginLeft: 6,
                }} 
              />
            )}
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: 10 }} />}
              onClick={(e) => handleTabClose(e, tab.path)}
              style={{ 
                marginLeft: 6, 
                padding: '0 4px',
                height: 18,
                width: 18,
                minWidth: 18,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default TabBar
