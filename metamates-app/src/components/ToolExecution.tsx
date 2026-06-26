import React from 'react'
import { Card, Tag, Typography, Space, Tooltip, Progress, Collapse } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ToolOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

export interface ToolExecution {
  id: string
  tool: string
  status: 'pending' | 'running' | 'success' | 'error'
  args: Record<string, unknown>
  result?: unknown
  error?: string
  duration?: number
  timestamp: number
}

export interface ToolExecutionProps {
  executions: ToolExecution[]
  compact?: boolean
}

const toolLabels: Record<string, string> = {
  write_file: '创建/写入文件',
  read_file: '读取文件',
  delete_file: '删除文件',
  append_file: '追加内容',
  search_content: '搜索内容',
  list_files: '列出文件',
  summarize: '总结内容',
  analyze: '分析内容',
  extract_tasks: '提取任务',
  find_links: '查找链接',
  generate_report: '生成报告',
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <ToolOutlined style={{ color: '#999' }} />,
  running: <LoadingOutlined style={{ color: '#1890ff' }} spin />,
  success: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  error: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
}

const statusColors: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  success: 'success',
  error: 'error',
}

const ToolExecution: React.FC<ToolExecutionProps> = ({ executions, compact = false }) => {
  const formatDuration = (ms?: number): string => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatArgs = (args: Record<string, any>): string => {
    const entries = Object.entries(args)
    if (entries.length === 0) return '无参数'
    
    return entries.map(([key, value]) => {
      const displayValue = typeof value === 'string' 
        ? (value.length > 50 ? `${value.substring(0, 50)}...` : value)
        : JSON.stringify(value)
      return `${key}: ${displayValue}`
    }).join('\n')
  }

  const successCount = executions.filter(e => e.status === 'success').length
  const errorCount = executions.filter(e => e.status === 'error').length
  const runningCount = executions.filter(e => e.status === 'running').length
  const totalDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0)

  if (compact) {
    return (
      <Space wrap size={4}>
        {executions.map(exec => (
          <Tooltip 
            key={exec.id}
            title={
              <div>
                <div><strong>{toolLabels[exec.tool] || exec.tool}</strong></div>
                {exec.duration && <div>耗时: {formatDuration(exec.duration)}</div>}
                {exec.error && <div style={{ color: '#ff4d4f' }}>错误: {exec.error}</div>}
              </div>
            }
          >
            <Tag 
              icon={statusIcons[exec.status]} 
              color={statusColors[exec.status]}
              style={{ margin: 0 }}
            >
              {toolLabels[exec.tool] || exec.tool}
            </Tag>
          </Tooltip>
        ))}
      </Space>
    )
  }

  return (
    <Card 
      size="small" 
      className="tool-execution-card"
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <ThunderboltOutlined />
          <Text strong>工具执行</Text>
          {executions.length > 0 && (
            <>
              <Tag color="blue">{executions.length} 个操作</Tag>
              {successCount > 0 && <Tag color="success">{successCount} 成功</Tag>}
              {errorCount > 0 && <Tag color="error">{errorCount} 失败</Tag>}
              {runningCount > 0 && <Tag color="processing">{runningCount} 执行中</Tag>}
              <Text type="secondary" style={{ fontSize: 12 }}>
                总耗时: {formatDuration(totalDuration)}
              </Text>
            </>
          )}
        </Space>
      }
    >
      {executions.length === 0 ? (
        <Text type="secondary">暂无工具执行记录</Text>
      ) : (
        <Collapse 
          ghost
          items={executions.map(exec => ({
            key: exec.id,
            label: (
              <Space>
                {statusIcons[exec.status]}
                <Text strong>{toolLabels[exec.tool] || exec.tool}</Text>
                {exec.duration && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDuration(exec.duration)}
                  </Text>
                )}
                {exec.status === 'running' && (
                  <Progress 
                    percent={100} 
                    status="active" 
                    size="small" 
                    style={{ width: 60 }}
                    showInfo={false}
                  />
                )}
              </Space>
            ),
            children: (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>参数:</Text>
                  <Paragraph 
                    style={{ 
                      fontSize: 12, 
                      marginBottom: 8,
                      background: '#fafafa',
                      padding: 8,
                      borderRadius: 4,
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {formatArgs(exec.args)}
                    </pre>
                  </Paragraph>
                </div>
                
                {exec.result !== undefined && exec.result !== null && (
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>结果:</Text>
                    <Paragraph 
                      style={{ 
                        fontSize: 12, 
                        marginBottom: 0,
                        background: '#f6ffed',
                        padding: 8,
                        borderRadius: 4,
                        borderLeft: '3px solid #52c41a',
                      }}
                    >
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {String(typeof exec.result === 'string' 
                          ? exec.result 
                          : JSON.stringify(exec.result, null, 2))}
                      </pre>
                    </Paragraph>
                  </div>
                )}

                {exec.error && (
                  <div>
                    <Text type="danger" style={{ fontSize: 12 }}>错误:</Text>
                    <Paragraph 
                      style={{ 
                        fontSize: 12, 
                        marginBottom: 0,
                        background: '#fff2f0',
                        padding: 8,
                        borderRadius: 4,
                        borderLeft: '3px solid #ff4d4f',
                      }}
                    >
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {exec.error}
                      </pre>
                    </Paragraph>
                  </div>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Card>
  )
}

export const createToolExecution = (
  tool: string,
  args: Record<string, any>
): ToolExecution => ({
  id: `${tool}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  tool,
  status: 'pending',
  args,
  timestamp: Date.now(),
})

export const updateExecutionStatus = (
  executions: ToolExecution[],
  execId: string,
  status: ToolExecution['status'],
  result?: any,
  error?: string
): ToolExecution[] => {
  return executions.map(exec => {
    if (exec.id === execId) {
      return {
        ...exec,
        status,
        result: result || exec.result,
        error: error || exec.error,
        duration: status !== 'pending' && status !== 'running'
          ? Date.now() - exec.timestamp
          : exec.duration,
      }
    }
    return exec
  })
}

export default ToolExecution
