import React from 'react'
import { Modal, Typography, Spin, Empty, Tag, Space } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography

interface ResultModalProps {
  visible: boolean
  onClose: () => void
  loading: boolean
  result: {
    success: boolean
    output: string
    error?: string
  } | null
  command?: string
}

const ResultModal: React.FC<ResultModalProps> = ({ 
  visible, 
  onClose, 
  loading, 
  result, 
  command 
}) => {
  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={
        <Space>
          {loading ? (
            <Tag color="processing">执行中</Tag>
          ) : result?.success ? (
            <Tag color="success">执行成功</Tag>
          ) : (
            <Tag color="error">执行失败</Tag>
          )}
          {command && <Text type="secondary">{command}</Text>}
        </Space>
      }
      footer={null}
      width={700}
      style={{ top: 80 }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
          <Paragraph style={{ marginTop: 16, color: '#888' }}>
            AI正在处理，请稍候...
          </Paragraph>
        </div>
      ) : result ? (
        <div>
          {result.success ? (
            <div>
              <div style={{ 
                marginBottom: 16, 
                padding: '8px 12px', 
                background: '#1a1a1a', 
                borderRadius: 6 
              }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                <Text>命令执行成功</Text>
              </div>
              <div style={{
                background: '#0d0d0d',
                borderRadius: 6,
                padding: 16,
                maxHeight: '400px',
                overflow: 'auto',
              }}>
                <Paragraph style={{ 
                  whiteSpace: 'pre-wrap', 
                  fontFamily: 'monospace',
                  margin: 0,
                  color: '#d4d4d4',
                }}>
                  {result.output || '无输出内容'}
                </Paragraph>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ 
                marginBottom: 16, 
                padding: '8px 12px', 
                background: '#2a1215', 
                borderRadius: 6 
              }}>
                <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                <Text type="danger">执行失败</Text>
              </div>
              <div style={{
                background: '#1a1a1a',
                borderRadius: 6,
                padding: 16,
              }}>
                <Paragraph style={{ color: '#ff4d4f' }}>
                  {result.error || '未知错误'}
                </Paragraph>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Empty description="暂无结果" />
      )}
    </Modal>
  )
}

export default ResultModal
