import React from 'react'
import { Tooltip, Spin } from 'antd'
import { useAppContext } from '../store/AppContext'
import { useTheme } from '../hooks/useTheme'
import { getAgentLogo, getAgentColor, getAgentInitial } from '../utils/agentLogo'
import { DEFAULT_AGENT_MODE } from '../utils/agentConnectionStatus'

interface AgentInfo {
  backend: string
  name: string
  cliPath?: string
  acpArgs?: string[]
  logo?: { type: 'file' | 'initial'; src?: string; initial?: string; bgColor?: string }
}

interface AgentSelectorProps {
  onConnect?: (backend: AgentInfo) => void
  onDisconnect?: () => void
}

const AgentSelector: React.FC<AgentSelectorProps> = ({ onConnect, onDisconnect }) => {
  const { state } = useAppContext()
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  
  const [loading, setLoading] = React.useState(false)
  const [models, setModels] = React.useState<{ id: string; name: string }[]>([])
  const [selectedModel, setSelectedModel] = React.useState<string>('')
  const [selectedMode, setSelectedMode] = React.useState<string>(DEFAULT_AGENT_MODE)
  const [detectedAgents, setDetectedAgents] = React.useState<AgentInfo[]>([])
  const [currentBackend, setCurrentBackend] = React.useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = React.useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [sessionId, setSessionId] = React.useState<string | null>(null)

  React.useEffect(() => {
    loadBackends()
  }, [])

  React.useEffect(() => {
    if (connectionStatus === 'connected' && sessionId) {
      loadModels()
    }
  }, [connectionStatus, sessionId])

  const loadBackends = async () => {
    try {
      const result = await window.electronAPI?.acp.getBackends()
      if (result && Array.isArray(result)) {
        setDetectedAgents(result)
        
        if (result.length > 0 && !currentBackend) {
          handleConnect(result[0])
        }
      }
    } catch (error) {
      console.error('Failed to load backends:', error)
    }
  }

  const loadModels = async () => {
    try {
      const result = await window.electronAPI?.acp.getModels()
      if (result?.models) {
        setModels(result.models)
        if (result.models.length > 0) {
          setSelectedModel(result.models[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error)
    }
  }

  const handleConnect = async (agent: AgentInfo) => {
    if (currentBackend === agent.backend && connectionStatus === 'connected') {
      return
    }
    
    setLoading(true)
    setConnectionStatus('connecting')
    try {
      const connectResult = await window.electronAPI?.acp.connect(agent.backend)
      
      if (connectResult?.success) {
        setCurrentBackend(agent.backend)
        
        const sessionResult = await window.electronAPI?.acp.newSession()
        
        if (sessionResult?.sessionId) {
          setSessionId(sessionResult.sessionId)
          setConnectionStatus('connected')
          onConnect?.(agent)
        } else {
          setConnectionStatus('error')
          console.error('Failed to create session')
        }
      } else {
        setConnectionStatus('error')
        console.error('Failed to connect:', connectResult?.error || 'Unknown error')
      }
    } catch (error) {
      setConnectionStatus('error')
      console.error('Failed to connect:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!currentBackend) return
    
    setLoading(true)
    try {
      await window.electronAPI?.acp.disconnect(currentBackend)
      setCurrentBackend(null)
      setSessionId(null)
      setConnectionStatus('disconnected')
      onDisconnect?.()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleModelChange = async (modelId: string) => {
    try {
      await window.electronAPI?.acp.setModel(modelId)
      setSelectedModel(modelId)
    } catch (error) {
      console.error('Failed to change model:', error)
    }
  }

  const handleModeChange = async (mode: string) => {
    try {
      await window.electronAPI?.acp.setMode(mode)
      setSelectedMode(mode)
    } catch (error) {
      console.error('Failed to change mode:', error)
    }
  }

  const getPillStatus = (backendId: string) => {
    if (currentBackend === backendId) {
      return connectionStatus
    }
    return 'disconnected'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return '#22c55e'
      case 'connecting': return '#eab308'
      case 'error': return '#ef4444'
      default: return 'transparent'
    }
  }

  const renderAgentIcon = (agent: AgentInfo) => {
    if (agent.logo?.type === 'file' && agent.logo.src) {
      return (
        <img 
          src={agent.logo.src} 
          alt={agent.name} 
          style={{ 
            width: 24, 
            height: 24, 
            objectFit: 'contain' 
          }} 
        />
      )
    }
    
    const bgColor = agent.logo?.bgColor || getAgentColor(agent.backend)
    const initial = agent.logo?.initial || getAgentInitial(agent.name)
    
    return (
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: '50%',
        fontSize: 14,
        fontWeight: 'bold',
        color: 'white',
        background: bgColor,
      }}>
        {initial}
      </span>
    )
  }

  const currentAgent = detectedAgents.find(a => a.backend === currentBackend)

  return (
    <div style={{
      padding: '12px',
      borderBottom: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
      background: isDark ? '#1e1e1e' : '#fafafa',
    }}>
      <div style={{ 
        marginBottom: 12,
        fontSize: 12,
        color: isDark ? '#a6adc8' : '#6b7280',
      }}>
        AI Agents
      </div>
      
      {detectedAgents.length === 0 ? (
        <div style={{ 
          color: isDark ? '#6b7280' : '#9ca3af', 
          fontSize: 12,
          textAlign: 'center',
          padding: '16px 0',
        }}>
          No CLI agents detected
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          {detectedAgents.map((agent) => {
            const status = getPillStatus(agent.backend)
            const isSelected = currentBackend === agent.backend
            
            return (
              <Tooltip key={agent.backend} title={agent.name}>
                <div
                  onClick={() => handleConnect(agent)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    cursor: loading ? 'wait' : 'pointer',
                    opacity: isSelected ? 1 : 0.5,
                    border: isSelected ? `2px solid #2563eb` : '2px solid transparent',
                    background: isSelected ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                    transition: 'all 0.2s',
                    position: 'relative',
                  }}
                >
                  {renderAgentIcon(agent)}
                  
                  {status !== 'disconnected' && (
                    <span style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 8,
                      height: 8,
                      minWidth: 8,
                      minHeight: 8,
                      borderRadius: '50%',
                      background: getStatusColor(status),
                      border: `2px solid ${isDark ? '#1e1e1e' : '#fafafa'}`,
                      animation: status === 'connecting' ? 'pulse 1s infinite' : 'none',
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              </Tooltip>
            )
          })}
        </div>
      )}

      {connectionStatus === 'connected' && currentAgent && (
        <div style={{ marginTop: 12 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            marginBottom: 8,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#22c55e',
            }} />
            <span style={{ 
              fontSize: 12, 
              fontWeight: 500,
              color: isDark ? '#e6e6e6' : '#1f2937',
            }}>
              {currentAgent.name}
            </span>
            {sessionId && (
              <span style={{
                fontSize: 10,
                color: isDark ? '#6b7280' : '#9ca3af',
              }}>
                ({sessionId.substring(0, 8)})
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              style={{
                flex: 1,
                background: isDark ? '#1e1e2e' : '#ffffff',
                border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
                color: isDark ? '#e6e6e6' : '#1f2937',
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <option value="">-- Model --</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
            
            <select
              value={selectedMode}
              onChange={(e) => handleModeChange(e.target.value)}
              style={{
                background: isDark ? '#1e1e2e' : '#ffffff',
                border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
                color: isDark ? '#e6e6e6' : '#1f2937',
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <option value="default">Default</option>
              <option value="yolo">YOLO</option>
              <option value="plan">Plan</option>
            </select>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={loading}
            style={{
              padding: '6px 12px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 12,
            }}
          >
            Disconnect
          </button>
        </div>
      )}

      {connectionStatus === 'error' && (
        <div style={{ 
          marginTop: 12,
          padding: '8px 12px', 
          background: isDark ? '#2d1f1f' : '#fff1f0',
          borderRadius: 4,
          color: '#ff4d4f',
          fontSize: 12,
        }}>
          Connection error
        </div>
      )}

      {loading && connectionStatus === 'connecting' && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
          <div style={{ marginTop: 8, color: isDark ? '#a6adc8' : '#6b7280', fontSize: 12 }}>
            Connecting...
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default AgentSelector
