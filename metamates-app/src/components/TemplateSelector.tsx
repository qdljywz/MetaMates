import React, { useState, useEffect } from 'react'
import { Modal, List, Button, Input, Tag, message } from 'antd'
import { FileTextOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { FileTemplate } from '../services/templateService'
import { templateService } from '../services/templateService'

interface TemplateSelectorProps {
  visible: boolean
  onClose: () => void
  onSelect: (content: string, template: FileTemplate) => void
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ visible, onClose, onSelect }) => {
  const { t } = useTranslation('templates')
  const [templates, setTemplates] = useState<FileTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    if (visible) {
      loadTemplates()
    }
  }, [visible])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const result = templateService.getAllTemplates()
      setTemplates(result)
    } catch (error) {
      message.error(t('loadFailed'))
    }
    setLoading(false)
  }

  const handleSelect = (template: FileTemplate) => {
    const content = templateService.renderTemplate(template.id)
    onSelect(content, template)
    onClose()
  }

  const handleDelete = (template: FileTemplate) => {
    const success = templateService.removeCustomTemplate(template.id)
    if (success) {
      message.success(t('templateDeleted'))
      loadTemplates()
    } else {
      message.warning(t('builtinCannotDelete'))
    }
  }

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchText.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchText.toLowerCase())
  )

  const isCustomTemplate = (template: FileTemplate) => {
    return template.id.startsWith('custom_')
  }

  return (
    <Modal
      title={t('title')}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          prefix={<FileTextOutlined />}
        />
      </div>

      <List
        loading={loading}
        dataSource={filteredTemplates}
        renderItem={(template) => (
          <List.Item
            actions={[
              <Button 
                key="use" 
                type="primary" 
                size="small"
                onClick={() => handleSelect(template)}
              >
                {t('use')}
              </Button>,
              isCustomTemplate(template) && (
                <Button 
                  key="delete" 
                  type="text" 
                  danger 
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(template)}
                />
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={
                <span>
                  {template.name}
                  {!isCustomTemplate(template) && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>{t('builtin')}</Tag>
                  )}
                </span>
              }
              description={template.description || t('noDescription')}
            />
          </List.Item>
        )}
        locale={{ emptyText: t('noTemplates') }}
      />
    </Modal>
  )
}

export default TemplateSelector