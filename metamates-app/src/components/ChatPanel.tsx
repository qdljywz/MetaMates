import React from 'react'
import TerminalPanel from './TerminalPanel'
import { useTheme } from '../hooks/useTheme'

interface ChatPanelProps {
  onFileCreated?: (path: string) => void
}

const ChatPanel: React.FC<ChatPanelProps> = () => {
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: isDark ? '#141414' : '#fafafa'
    }}>
      <TerminalPanel style={{ flex: 1 }} />
    </div>
  )
}

export default ChatPanel
