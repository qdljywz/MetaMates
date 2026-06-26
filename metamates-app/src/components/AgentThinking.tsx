import React, { useState, useEffect } from 'react'
import { Card, Steps, Tag, Typography, Collapse, Space, Spin } from 'antd'
import { 
  BulbOutlined, 
  CheckCircleOutlined, 
  LoadingOutlined,
  FileTextOutlined,
  SearchOutlined,
  ToolOutlined,
  EyeOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

export interface ThinkingStep {
  id: string
  type: 'planning' | 'searching' | 'reading' | 'executing' | 'reflecting'
  status: 'pending' | 'running' | 'completed' | 'failed'
  title: string
  description?: string
  details?: string
  duration?: number
  startTime?: number
}

export interface AgentThinkingProps {
  steps: ThinkingStep[]
  isThinking: boolean
  currentStep?: string
  onStepClick?: (stepId: string) => void
}

const stepIcons: Record<string, React.ReactNode> = {
  planning: <BulbOutlined />,
  searching: <SearchOutlined />,
  reading: <FileTextOutlined />,
  executing: <ToolOutlined />,
  reflecting: <EyeOutlined />,
}

const stepColors: Record<string, string> = {
  planning: '#1890ff',
  searching: '#722ed1',
  reading: '#13c2c2',
  executing: '#fa8c16',
  reflecting: '#52c41a',
}

const AgentThinking: React.FC<AgentThinkingProps> = ({
  steps,
  isThinking,
  currentStep: _currentStep,
  onStepClick: _onStepClick,
}) => {
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (isThinking) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 100)
      }, 100)
    } else {
      setElapsedTime(0)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isThinking])

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const getStepStatus = (step: ThinkingStep): 'wait' | 'process' | 'finish' | 'error' => {
    switch (step.status) {
      case 'pending': return 'wait'
      case 'running': return 'process'
      case 'completed': return 'finish'
      case 'failed': return 'error'
      default: return 'wait'
    }
  }

  const completedCount = steps.filter(s => s.status === 'completed').length
  const totalCount = steps.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <Card 
      size="small" 
      className="agent-thinking-card"
      style={{ 
        marginBottom: 12,
        border: isThinking ? '1px solid #1890ff' : undefined,
        boxShadow: isThinking ? '0 2px 8px rgba(24, 144, 255, 0.15)' : undefined,
      }}
      title={
        <Space>
          {isThinking ? (
            <>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 16, color: '#1890ff' }} spin />} />
              <BulbOutlined style={{ color: '#1890ff' }} />
              <Text strong style={{ color: '#1890ff' }}>Agent 思考中...</Text>
              <Tag color="blue">{formatDuration(elapsedTime)}</Tag>
            </>
          ) : (
            <>
              <BulbOutlined style={{ color: '#52c41a' }} />
              <Text strong>Agent 思考过程</Text>
              {totalCount > 0 && (
                <Tag color="green">{completedCount}/{totalCount} 完成</Tag>
              )}
            </>
          )}
        </Space>
      }
    >
      {steps.length === 0 && isThinking && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            正在分析你的请求...
          </Text>
        </div>
      )}

      {steps.length > 0 && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div 
              style={{ 
                height: 4, 
                background: '#f0f0f0', 
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div 
                style={{ 
                  height: '100%', 
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #1890ff, #52c41a)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              进度: {progress}%
            </Text>
          </div>

          <Steps
            direction="vertical"
            size="small"
            current={steps.findIndex(s => s.status === 'running')}
            items={steps.map(step => ({
              key: step.id,
              title: (
                <Space>
                  <span>{step.title}</span>
                  {step.duration && (
                    <Tag 
                      color={step.status === 'completed' ? 'success' : 'default'}
                      style={{ fontSize: 10 }}
                    >
                      {formatDuration(step.duration)}
                    </Tag>
                  )}
                </Space>
              ),
              description: step.description,
              status: getStepStatus(step),
              icon: step.status === 'running' ? (
                <LoadingOutlined style={{ color: stepColors[step.type] }} />
              ) : (
                stepIcons[step.type]
              ),
            }))}
          />

          <Collapse 
            ghost 
            style={{ marginTop: 8 }}
            items={steps
              .filter(s => s.details)
              .map(step => ({
                key: step.id,
                label: (
                  <Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {step.title} 详情
                    </Text>
                    {step.status === 'completed' && (
                      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                    )}
                  </Space>
                ),
                children: (
                  <Paragraph 
                    style={{ 
                      fontSize: 12, 
                      marginBottom: 0,
                      background: '#fafafa',
                      padding: 8,
                      borderRadius: 4,
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {step.details}
                    </pre>
                  </Paragraph>
                ),
              }))}
          />
        </>
      )}
    </Card>
  )
}

export const createThinkingStep = (
  type: ThinkingStep['type'],
  title: string,
  description?: string
): ThinkingStep => ({
  id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  status: 'pending',
  title,
  description,
  startTime: Date.now(),
})

export const updateStepStatus = (
  steps: ThinkingStep[],
  stepId: string,
  status: ThinkingStep['status'],
  details?: string
): ThinkingStep[] => {
  return steps.map(step => {
    if (step.id === stepId) {
      return {
        ...step,
        status,
        details: details || step.details,
        duration: status === 'completed' || status === 'failed' 
          ? Date.now() - (step.startTime || Date.now()) 
          : step.duration,
      }
    }
    return step
  })
}

export default AgentThinking
