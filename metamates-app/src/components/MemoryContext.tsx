import React, { useState } from 'react'
import { Card, Tag, Typography, Space, Collapse, Badge, Tooltip, Empty, Button } from 'antd'
import {
  DatabaseOutlined,
  UserOutlined,
  ProjectOutlined,
  HistoryOutlined,
  BulbOutlined,
  SettingOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

export interface MemoryItem {
  id: string
  type: 'fact' | 'preference' | 'context' | 'action' | 'summary'
  content: string
  importance: number
  source: string
  timestamp: number
  accessCount?: number
}

export interface MemoryContextData {
  userProfile?: {
    name?: string
    preferences: Record<string, unknown>
  }
  projectContext?: {
    name?: string
    description?: string
  }
  relevantMemories: MemoryItem[]
  conversationSummaries: Array<{
    sessionId: string
    summary: string
    keyPoints: string[]
  }>
  stats: {
    totalEntries: number
    totalSummaries: number
    oldestEntry?: number
    newestEntry?: number
  }
}

export interface MemoryContextProps {
  memoryData: MemoryContextData | null
  loading?: boolean
  compact?: boolean
  onManageMemory?: () => void
}

const typeIcons: Record<string, React.ReactNode> = {
  fact: <BulbOutlined />,
  preference: <SettingOutlined />,
  context: <ProjectOutlined />,
  action: <HistoryOutlined />,
  summary: <FileTextOutlined />,
}

const typeColors: Record<string, string> = {
  fact: 'gold',
  preference: 'purple',
  context: 'blue',
  action: 'green',
  summary: 'cyan',
}

const typeLabels: Record<string, string> = {
  fact: '事实',
  preference: '偏好',
  context: '上下文',
  action: '操作',
  summary: '摘要',
}

const MemoryContext: React.FC<MemoryContextProps> = ({
  memoryData,
  loading: _loading = false,
  compact = false,
  onManageMemory,
}) => {
  const [visible, setVisible] = useState(!compact)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getImportanceColor = (importance: number): string => {
    if (importance >= 8) return '#ff4d4f'
    if (importance >= 6) return '#fa8c16'
    if (importance >= 4) return '#faad14'
    return '#52c41a'
  }

  if (!memoryData) {
    return (
      <Card size="small" style={{ marginBottom: 12 }}>
        <Empty 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary">暂无记忆数据</Text>
          }
        />
      </Card>
    )
  }

  if (compact) {
    return (
      <Card 
        size="small" 
        style={{ marginBottom: 12 }}
        title={
          <Space>
            <DatabaseOutlined />
            <Text strong>记忆上下文</Text>
            <Badge 
              count={memoryData.relevantMemories.length} 
              size="small"
              style={{ backgroundColor: '#1890ff' }}
            />
          </Space>
        }
        extra={
          <Button 
            type="text" 
            size="small"
            icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setVisible(!visible)}
          />
        }
      >
        {visible && (
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {memoryData.userProfile?.name && (
              <div>
                <UserOutlined style={{ marginRight: 8 }} />
                <Text>用户: {memoryData.userProfile.name}</Text>
              </div>
            )}
            
            {memoryData.projectContext?.name && (
              <div>
                <ProjectOutlined style={{ marginRight: 8 }} />
                <Text>项目: {memoryData.projectContext.name}</Text>
              </div>
            )}

            {memoryData.relevantMemories.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  相关记忆 ({memoryData.relevantMemories.length}):
                </Text>
                <div style={{ marginTop: 4 }}>
                  {memoryData.relevantMemories.slice(0, 3).map(memory => (
                    <Tooltip key={memory.id} title={memory.content}>
                      <Tag 
                        color={typeColors[memory.type]}
                        style={{ marginBottom: 4, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {typeIcons[memory.type]} {memory.content.substring(0, 30)}...
                      </Tag>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </Space>
        )}
      </Card>
    )
  }

  return (
    <Card 
      size="small" 
      className="memory-context-card"
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <DatabaseOutlined />
          <Text strong>记忆上下文</Text>
          <Tag color="blue">{memoryData.stats.totalEntries} 条记录</Tag>
          <Tag color="purple">{memoryData.stats.totalSummaries} 个摘要</Tag>
        </Space>
      }
      extra={
        onManageMemory && (
          <Button type="link" size="small" onClick={onManageMemory}>
            管理记忆
          </Button>
        )
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {memoryData.userProfile && (
          <div>
            <Space style={{ marginBottom: 8 }}>
              <UserOutlined />
              <Text strong>用户信息</Text>
            </Space>
            <div style={{ paddingLeft: 20 }}>
              {memoryData.userProfile.name && (
                <Text>姓名: {memoryData.userProfile.name}</Text>
              )}
              {Object.keys(memoryData.userProfile.preferences).length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>偏好设置:</Text>
                  <div style={{ marginTop: 4 }}>
                    {Object.entries(memoryData.userProfile.preferences).map(([key, value]) => (
                      <Tag key={key} color="purple" style={{ marginBottom: 4 }}>
                        {key}: {String(value)}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {memoryData.projectContext && (
          <div>
            <Space style={{ marginBottom: 8 }}>
              <ProjectOutlined />
              <Text strong>项目信息</Text>
            </Space>
            <div style={{ paddingLeft: 20 }}>
              {memoryData.projectContext.name && (
                <Text>项目名: {memoryData.projectContext.name}</Text>
              )}
              {memoryData.projectContext.description && (
                <Paragraph 
                  type="secondary" 
                  style={{ fontSize: 12, marginBottom: 0, marginTop: 4 }}
                >
                  {memoryData.projectContext.description}
                </Paragraph>
              )}
            </div>
          </div>
        )}

        {memoryData.relevantMemories.length > 0 && (
          <div>
            <Space style={{ marginBottom: 8 }}>
              <BulbOutlined />
              <Text strong>相关记忆</Text>
              <Badge 
                count={memoryData.relevantMemories.length} 
                style={{ backgroundColor: '#52c41a' }}
              />
            </Space>
            <Collapse 
              ghost
              activeKey={expandedKeys}
              onChange={(keys) => setExpandedKeys(keys as string[])}
              items={memoryData.relevantMemories.map(memory => ({
                key: memory.id,
                label: (
                  <Space>
                    {typeIcons[memory.type]}
                    <Text>{memory.content.substring(0, 50)}...</Text>
                    <Tag 
                      color={typeColors[memory.type]}
                      style={{ marginLeft: 'auto' }}
                    >
                      {typeLabels[memory.type]}
                    </Tag>
                    <Tooltip title={`重要度: ${memory.importance}/10`}>
                      <div 
                        style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%',
                          background: getImportanceColor(memory.importance),
                        }} 
                      />
                    </Tooltip>
                  </Space>
                ),
                children: (
                  <div>
                    <Paragraph style={{ marginBottom: 8 }}>
                      {memory.content}
                    </Paragraph>
                    <Space size="small">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <ClockCircleOutlined /> {formatDate(memory.timestamp)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        来源: {memory.source}
                      </Text>
                      {memory.accessCount && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          访问: {memory.accessCount} 次
                        </Text>
                      )}
                    </Space>
                  </div>
                ),
              }))}
            />
          </div>
        )}

        {memoryData.conversationSummaries.length > 0 && (
          <div>
            <Space style={{ marginBottom: 8 }}>
              <HistoryOutlined />
              <Text strong>对话摘要</Text>
              <Badge 
                count={memoryData.conversationSummaries.length} 
                style={{ backgroundColor: '#722ed1' }}
              />
            </Space>
            <div style={{ paddingLeft: 20 }}>
              {memoryData.conversationSummaries.slice(0, 2).map((summary) => (
                <div 
                  key={summary.sessionId}
                  style={{ 
                    marginBottom: 8,
                    padding: 8,
                    background: '#fafafa',
                    borderRadius: 4,
                  }}
                >
                  <Text>{summary.summary}</Text>
                  {summary.keyPoints.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {summary.keyPoints.map((point, i) => (
                        <Tag key={i} style={{ marginBottom: 4, fontSize: 11 }}>
                          {point}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ 
          padding: 8, 
          background: '#f0f0f0', 
          borderRadius: 4,
          marginTop: 8,
        }}>
          <Space split={<Text type="secondary">|</Text>}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              总记录: {memoryData.stats.totalEntries}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              摘要: {memoryData.stats.totalSummaries}
            </Text>
            {memoryData.stats.oldestEntry && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                最早: {formatDate(memoryData.stats.oldestEntry)}
              </Text>
            )}
          </Space>
        </div>
      </Space>
    </Card>
  )
}

export default MemoryContext
