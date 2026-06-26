import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Button, Typography, Space, Tag, Tooltip, message, Modal, Input } from 'antd'
import { 
  PlayCircleOutlined, ClearOutlined, CodeOutlined,
  FolderOutlined, StopOutlined, CalendarOutlined, BulbOutlined,
  RocketOutlined, AimOutlined, RobotOutlined
} from '@ant-design/icons'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAppContext } from '../store/AppContext'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import { COMMANDS } from '../commands/definitions'

const { Text } = Typography
const { TextArea } = Input

const COMMANDS_REQUIRING_INPUT: Record<string, { title: string; placeholder: string }> = {
  '/trace': { title: '溯源想法', placeholder: '请输入你想追溯的想法...' },
  '/connect': { title: '寻找连接', placeholder: '请输入两个主题，用逗号分隔（如：AI, 医疗）...' },
  '/challenge': { title: '挑战观点', placeholder: '请输入你想挑战的观点...' },
  '/ghost': { title: '模拟代写', placeholder: '请输入你想写的内容描述...' },
}

interface TerminalPanelProps {
  style?: React.CSSProperties
}

const categoryIcons: Record<string, React.ReactNode> = {
  daily: <CalendarOutlined />,
  thinking: <BulbOutlined />,
  inspiration: <RocketOutlined />,
  planning: <AimOutlined />
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ style }) => {
  const { state } = useAppContext()
  const { t } = useTranslation('terminal')
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pidRef = useRef<number | null>(null)
  const initializedRef = useRef(false)
  
  const [inputModalVisible, setInputModalVisible] = useState(false)
  const [currentCommand, setCurrentCommand] = useState<string | null>(null)
  const [userInputValue, setUserInputValue] = useState('')

  const startTerminal = useCallback(async () => {
    if (!xtermRef.current) {
      console.log('[TerminalPanel] startTerminal: xterm not ready yet')
      return
    }

    if (initializedRef.current && pidRef.current) {
      console.log('[TerminalPanel] Terminal already running with pid:', pidRef.current)
      return
    }

    console.log('[TerminalPanel] startTerminal called, workspacePath:', state.workspacePath)
    console.log('[TerminalPanel] window.electronAPI exists:', !!window.electronAPI)
    console.log('[TerminalPanel] window.electronAPI.terminal exists:', !!window.electronAPI?.terminal)

    xtermRef.current.clear()
    xtermRef.current.write('\x1b[33m' + t('starting') + '...\x1b[0m\r\n')

    const cwd = state.workspacePath || undefined
    console.log('[TerminalPanel] Calling terminal.start with cwd:', cwd)

    try {
      if (!window.electronAPI?.terminal) {
        xtermRef.current.write('\x1b[31m✗ ' + t('startFailed') + ': electronAPI.terminal \x1b[0m\r\n')
        return
      }
      
      const result = await window.electronAPI.terminal.start(cwd)
      console.log('[TerminalPanel] terminal.start result:', result)
      if (result?.success && result.pid) {
        pidRef.current = result.pid
        initializedRef.current = true
        xtermRef.current.write('\x1b[32m✓ ' + t('connected') + '\x1b[0m\r\n')
      } else {
        xtermRef.current.write(`\x1b[31m✗ ${t('startFailed')}: ${result?.error || t('unknownError')}\x1b[0m\r\n`)
      }
    } catch (error: any) {
      console.error('[TerminalPanel] terminal.start error:', error)
      xtermRef.current.write(`\x1b[31m✗ ${t('startFailed')}: ${error.message}\x1b[0m\r\n`)
    }
  }, [state.workspacePath, t])

  useEffect(() => {
    if (xtermRef.current) {
      const darkTheme = {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#52c41a',
        cursorAccent: '#1e1e1e',
        black: '#000000',
        red: '#ff4d4f',
        green: '#52c41a',
        yellow: '#faad14',
        blue: '#1890ff',
        magenta: '#eb2f96',
        cyan: '#13c2c2',
        white: '#d4d4d4',
        brightBlack: '#666666',
        brightBlue: '#40a9ff',
        brightCyan: '#36cfc9',
        brightGreen: '#73d13d',
        brightMagenta: '#f759ab',
        brightRed: '#ff7875',
        brightYellow: '#ffc53d',
        brightWhite: '#ffffff',
      }

      const lightTheme = {
        background: '#ffffff',
        foreground: '#1f2937',
        cursor: '#2563eb',
        cursorAccent: '#ffffff',
        black: '#000000',
        red: '#dc2626',
        green: '#16a34a',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#db2777',
        cyan: '#0891b2',
        white: '#1f2937',
        brightBlack: '#6b7280',
        brightBlue: '#3b82f6',
        brightCyan: '#06b6d4',
        brightGreen: '#22c55e',
        brightMagenta: '#ec4899',
        brightRed: '#ef4444',
        brightYellow: '#f59e0b',
        brightWhite: '#111827',
      }

      xtermRef.current.options.theme = isDark ? darkTheme : lightTheme
    }
  }, [isDark])

  useEffect(() => {
    if (!terminalRef.current) {
      console.error('[TerminalPanel] terminalRef.current is null!')
      return
    }

    console.log('[TerminalPanel] Initializing xterm...')

    const darkTheme = {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#52c41a',
      cursorAccent: '#1e1e1e',
      black: '#000000',
      red: '#ff4d4f',
      green: '#52c41a',
      yellow: '#faad14',
      blue: '#1890ff',
      magenta: '#eb2f96',
      cyan: '#13c2c2',
      white: '#d4d4d4',
      brightBlack: '#666666',
      brightBlue: '#40a9ff',
      brightCyan: '#36cfc9',
      brightGreen: '#73d13d',
      brightMagenta: '#f759ab',
      brightRed: '#ff7875',
      brightYellow: '#ffc53d',
      brightWhite: '#ffffff',
    }

    const lightTheme = {
      background: '#ffffff',
      foreground: '#1f2937',
      cursor: '#2563eb',
      cursorAccent: '#ffffff',
      black: '#000000',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#d97706',
      blue: '#2563eb',
      magenta: '#db2777',
      cyan: '#0891b2',
      white: '#1f2937',
      brightBlack: '#6b7280',
      brightBlue: '#3b82f6',
      brightCyan: '#06b6d4',
      brightGreen: '#22c55e',
      brightMagenta: '#ec4899',
      brightRed: '#ef4444',
      brightYellow: '#f59e0b',
      brightWhite: '#111827',
    }

    const terminal = new Terminal({
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      convertEol: true,
      allowProposedApi: true,
      theme: isDark ? darkTheme : lightTheme,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    
    terminal.open(terminalRef.current)
    fitAddon.fit()
    
    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    console.log('[TerminalPanel] xterm initialized')

    setTimeout(() => {
      fitAddon.fit()
    }, 100)

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (pidRef.current) {
        window.electronAPI?.terminal.resize(pidRef.current, terminal.cols, terminal.rows)
      }
    })
    resizeObserver.observe(terminalRef.current)

    terminal.onData((data) => {
      if (pidRef.current) {
        window.electronAPI?.terminal.input(pidRef.current, data)
      }
    })

    terminal.onResize(({ cols, rows }) => {
      if (pidRef.current) {
        window.electronAPI?.terminal.resize(pidRef.current, cols, rows)
      }
    })

    setTimeout(() => {
      console.log('[TerminalPanel] Starting terminal after delay...')
      startTerminal()
    }, 300)

    return () => {
      console.log('[TerminalPanel] Cleaning up...')
      resizeObserver.disconnect()
      if (pidRef.current) {
        window.electronAPI?.terminal.kill(pidRef.current)
      }
      terminal.dispose()
      initializedRef.current = false
    }
  }, [startTerminal])

  useEffect(() => {
    if (!window.electronAPI?.terminal) {
      console.error('[TerminalPanel] electronAPI.terminal not available!')
      return
    }

    const handleOutput = (data: { type: string; data: string; pid?: number }) => {
      console.log('[TerminalPanel] Received output:', data.type, data.pid)
      if (xtermRef.current && data.pid === pidRef.current) {
        if (data.type === 'data') {
          xtermRef.current.write(data.data)
        } else if (data.type === 'exit') {
          xtermRef.current.write(data.data)
          pidRef.current = null
          initializedRef.current = false
        }
      }
    }

    window.electronAPI?.terminal.onOutput(handleOutput)

    return () => {
      window.electronAPI?.terminal.removeListeners()
    }
  }, [])

  const stopTerminal = async () => {
    if (pidRef.current) {
      await window.electronAPI?.terminal.kill(pidRef.current)
      pidRef.current = null
      initializedRef.current = false
      xtermRef.current?.write('\r\n\x1b[33m✓ ' + t('stopped') + '\x1b[0m\r\n')
    }
  }

  const handleClear = () => {
    xtermRef.current?.clear()
    message.success(t('cleared'))
  }

  const sendCommand = (cmd: string) => {
    if (pidRef.current) {
      window.electronAPI?.terminal.input(pidRef.current, cmd + '\r')
    }
  }

  const quickCommands = [
    { label: t('quickCommands.gemini'), cmd: 'gemini' },
    { label: t('quickCommands.dir'), cmd: 'dir' },
    { label: t('quickCommands.cdUp'), cmd: 'cd ..' },
  ]

  const executeAICommand = async (commandId: string, userInput?: string) => {
    const command = COMMANDS.find(cmd => cmd.id === commandId)
    if (!command) return

    if (!pidRef.current) {
      message.warning('请先启动终端')
      return
    }

    xtermRef.current?.write('\r\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n')
    xtermRef.current?.write(`\x1b[1;35m🤖 AI 命令: ${command.name}\x1b[0m\r\n`)
    if (userInput) {
      xtermRef.current?.write(`\x1b[33m📝 用户输入: ${userInput}\x1b[0m\r\n`)
    }
    xtermRef.current?.write('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n')
    xtermRef.current?.write('\r\n\x1b[32m⏳ 正在通过 Gemini CLI 执行...\x1b[0m\r\n\r\n')

    let geminiCommand = commandId
    if (userInput) {
      geminiCommand = `${commandId} ${userInput}`
    }
    
    window.electronAPI?.terminal.input(pidRef.current, geminiCommand + '\r')
  }

  const handleAICommandClick = (commandId: string) => {
    if (COMMANDS_REQUIRING_INPUT[commandId]) {
      setCurrentCommand(commandId)
      setUserInputValue('')
      setInputModalVisible(true)
    } else {
      executeAICommand(commandId)
    }
  }

  const handleInputModalOk = () => {
    if (currentCommand && userInputValue.trim()) {
      executeAICommand(currentCommand, userInputValue.trim())
    }
    setInputModalVisible(false)
    setCurrentCommand(null)
    setUserInputValue('')
  }

  const handleInputModalCancel = () => {
    setInputModalVisible(false)
    setCurrentCommand(null)
    setUserInputValue('')
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: isDark ? '#1e1e1e' : '#ffffff',
      ...style 
    }}>
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDark ? '#252526' : '#f9fafb'
      }}>
        <Space>
          <CodeOutlined style={{ color: '#52c41a' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            终端
          </Text>
        </Space>
        <Space>
          <Text type="secondary" style={{ fontSize: 11, color: isDark ? '#666' : '#9ca3af' }}>
            <FolderOutlined /> {state.workspacePath?.split(/[/\\]/).pop() || t('noWorkspace')}
          </Text>
          <Tooltip title={t('clear')}>
            <Button 
              type="text" 
              icon={<ClearOutlined style={{ color: isDark ? '#888' : '#6b7280' }} />} 
              onClick={handleClear}
              size="small"
            />
          </Tooltip>
          <Tooltip title={t('restart')}>
            <Button 
              type="text" 
              icon={<PlayCircleOutlined style={{ color: isDark ? '#888' : '#6b7280' }} />} 
              onClick={startTerminal}
              size="small"
            />
          </Tooltip>
        </Space>
      </div>

      <div style={{ 
        padding: '4px 8px',
        borderBottom: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
        background: isDark ? '#252526' : '#f9fafb',
      }}>
        <Space size={4}>
          {quickCommands.map(qc => (
            <Button
              key={qc.label}
              size="small"
              onClick={() => sendCommand(qc.cmd)}
              style={{ 
                fontSize: 11, 
                background: isDark ? '#333' : '#f3f4f6', 
                color: isDark ? '#d4d4d4' : '#374151',
                border: `1px solid ${isDark ? '#444' : '#d1d5db'}`
              }}
            >
              {qc.label}
            </Button>
          ))}
        </Space>
      </div>

      <div style={{ 
        padding: '6px 8px',
        borderBottom: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
        background: isDark ? '#1a1a1a' : '#f0f0f0',
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 4,
          gap: 6
        }}>
          <RobotOutlined style={{ fontSize: 12, color: '#1890ff' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            AI 命令 (通过 Gemini CLI 执行)
          </Text>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {COMMANDS.map(cmd => (
            <Tooltip key={cmd.id} title={cmd.description}>
              <Button
                size="small"
                icon={categoryIcons[cmd.category]}
                onClick={() => handleAICommandClick(cmd.id)}
                style={{ 
                  fontSize: 10,
                  background: isDark ? '#2d2d2d' : '#fff', 
                  color: isDark ? '#d4d4d4' : '#374151',
                  border: `1px solid ${isDark ? '#404040' : '#d9d9d9'}`
                }}
              >
                {cmd.name}
              </Button>
            </Tooltip>
          ))}
        </div>
      </div>

      <Modal
        title={currentCommand ? COMMANDS_REQUIRING_INPUT[currentCommand]?.title : ''}
        open={inputModalVisible}
        onOk={handleInputModalOk}
        onCancel={handleInputModalCancel}
        okText={t('ok')}
        cancelText={t('cancel')}
      >
        <TextArea
          value={userInputValue}
          onChange={(e) => setUserInputValue(e.target.value)}
          placeholder={currentCommand ? COMMANDS_REQUIRING_INPUT[currentCommand]?.placeholder : ''}
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Modal>

      <div 
        ref={terminalRef}
        style={{ 
          flex: 1, 
          padding: '8px',
          overflow: 'hidden',
          minHeight: '200px',
        }}
      />

      <div style={{ 
        padding: '8px 12px', 
        borderTop: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
        background: isDark ? '#252526' : '#f9fafb',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8
      }}>
        {pidRef.current ? (
          <Button
            danger
            icon={<StopOutlined />}
            onClick={stopTerminal}
            size="small"
          >
            {t('stop')}
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={startTerminal}
            size="small"
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            {t('start')}
          </Button>
        )}
      </div>
    </div>
  )
}

export default TerminalPanel
