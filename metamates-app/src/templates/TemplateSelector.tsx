import React, { useState, useEffect } from 'react'
import { Modal, Tabs, Card, Typography, Space, Tag, Button, Input, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { 
  CalendarOutlined, 
  ScheduleOutlined, 
  ProjectOutlined,
  FileTextOutlined,
  BulbOutlined,
  EditOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Template, getTemplatesByCategory } from './definitions'

const { Text } = Typography
const { TabPane } = Tabs
const { TextArea } = Input

interface TemplateSelectorProps {
  visible: boolean
  onClose: () => void
  onSelect: (content: string, template: Template, fixedFileName?: string) => void
}

const categoryIcons: Record<string, React.ReactNode> = {
  daily: <CalendarOutlined />,
  weekly: <ScheduleOutlined />,
  monthly: <CalendarOutlined />,
  project: <ProjectOutlined />,
  review: <BulbOutlined />,
  custom: <FileTextOutlined />,
}

const CUSTOM_TEMPLATES_KEY = 'metamates-custom-templates'

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ visible, onClose, onSelect }) => {
  const { t } = useTranslation('templates')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [preview, setPreview] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>({})

  const getCategoryName = (category: string) => {
    return t(`categories.${category}`)
  }

  useEffect(() => {
    const saved = localStorage.getItem(CUSTOM_TEMPLATES_KEY)
    if (saved) {
      try {
        setCustomTemplates(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load custom templates:', e)
      }
    }
  }, [])

  const handleSelect = (template: Template) => {
    setSelectedTemplate(template)
    const customContent = customTemplates[template.id]
    const contentToUse = customContent || template.content
    setEditedContent(contentToUse)
    
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const weekStr = `第${Math.ceil(now.getDate() / 7)}周`
    const monthStr = `${now.getMonth() + 1}月`
    
    const rendered = contentToUse
      .replace(/{{date}}/g, dateStr)
      .replace(/{{week}}/g, weekStr)
      .replace(/{{month}}/g, monthStr)
    
    setPreview(rendered)
    setIsEditing(false)
  }

  const handleConfirm = () => {
    if (selectedTemplate) {
      const now = new Date()
      const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      const weekStr = `第${Math.ceil(now.getDate() / 7)}周`
      const monthStr = `${now.getMonth() + 1}月`
      
      const contentToUse = customTemplates[selectedTemplate.id] || selectedTemplate.content
      const rendered = contentToUse
        .replace(/{{date}}/g, dateStr)
        .replace(/{{week}}/g, weekStr)
        .replace(/{{month}}/g, monthStr)
      
      onSelect(rendered, selectedTemplate, selectedTemplate.fixedFileName)
      onClose()
    }
  }

  const handleSaveTemplate = () => {
    if (!selectedTemplate) return
    
    const newCustomTemplates = {
      ...customTemplates,
      [selectedTemplate.id]: editedContent,
    }
    
    setCustomTemplates(newCustomTemplates)
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(newCustomTemplates))
    
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const weekStr = `第${Math.ceil(now.getDate() / 7)}周`
    const monthStr = `${now.getMonth() + 1}月`
    
    const rendered = editedContent
      .replace(/{{date}}/g, dateStr)
      .replace(/{{week}}/g, weekStr)
      .replace(/{{month}}/g, monthStr)
    
    setPreview(rendered)
    setIsEditing(false)
    message.success(t('templateSaved'))
  }

  const handleResetTemplate = () => {
    if (!selectedTemplate) return
    
    const newCustomTemplates = { ...customTemplates }
    delete newCustomTemplates[selectedTemplate.id]
    
    setCustomTemplates(newCustomTemplates)
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(newCustomTemplates))
    setEditedContent(selectedTemplate.content)
    
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const weekStr = `第${Math.ceil(now.getDate() / 7)}周`
    const monthStr = `${now.getMonth() + 1}月`
    
    const rendered = selectedTemplate.content
      .replace(/{{date}}/g, dateStr)
      .replace(/{{week}}/g, weekStr)
      .replace(/{{month}}/g, monthStr)
    
    setPreview(rendered)
    message.success(t('templateReset'))
  }

  const categories = ['daily', 'weekly', 'monthly', 'project', 'review', 'custom']

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={t('title')}
      width={900}
      className="template-selector-modal"
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('cancel')}
        </Button>,
        <Button 
          key="confirm" 
          type="primary" 
          onClick={handleConfirm}
          disabled={!selectedTemplate}
        >
          {t('useTemplate')}
        </Button>,
      ]}
    >
      <div className="template-selector__layout">
        <div style={{ flex: '0 0 300px', overflow: 'auto' }}>
          <Tabs defaultActiveKey="daily" tabPosition="left" style={{ height: '100%' }}>
            {categories.map(cat => (
              <TabPane 
                tab={
                  <Space>
                    {categoryIcons[cat]}
                    <span>{getCategoryName(cat)}</span>
                  </Space>
                } 
                key={cat}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {getTemplatesByCategory(cat as Template['category']).map(template => {
                    const isCustomized = !!customTemplates[template.id]
                    return (
                      <Card
                        key={template.id}
                        size="small"
                        hoverable
                        onClick={() => handleSelect(template)}
                        className={`template-selector__card${selectedTemplate?.id === template.id ? ' template-selector__card--selected' : ''}`}
                      >
                        <Space direction="vertical" size={4}>
                          <Space>
                            <Text strong>{template.name}</Text>
                            {isCustomized && <Tag color="blue" style={{ fontSize: 10 }}>{t('customized')}</Tag>}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {template.description}
                          </Text>
                        </Space>
                      </Card>
                    )
                  })}
                </div>
              </TabPane>
            ))}
          </Tabs>
        </div>

        <div className="template-selector__preview-pane">
          {selectedTemplate ? (
            <div>
              <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Tag color="blue">{getCategoryName(selectedTemplate.category)}</Tag>
                  <Text strong>{selectedTemplate.name}</Text>
                </Space>
                <Space>
                  <Button 
                    size="small" 
                    icon={isEditing ? <SaveOutlined /> : <EditOutlined />}
                    onClick={() => {
                      if (isEditing) {
                        handleSaveTemplate()
                      } else {
                        setIsEditing(true)
                      }
                    }}
                  >
                    {isEditing ? t('saveTemplate') : t('editTemplate')}
                  </Button>
                  {customTemplates[selectedTemplate.id] && (
                    <Button 
                      size="small" 
                      icon={<UndoOutlined />}
                      onClick={handleResetTemplate}
                    >
                      {t('resetTemplate')}
                    </Button>
                  )}
                </Space>
              </Space>
              
              {isEditing ? (
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                    {t('variables')}
                  </Text>
                  <TextArea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    rows={20}
                    style={{ 
                      fontFamily: 'monospace',
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  />
                </div>
              ) : (
                <div>
                  <pre className="template-selector__pre">
                    {preview}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="template-selector__empty">
              {t('selectTemplate')}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default TemplateSelector
export type { Template }
