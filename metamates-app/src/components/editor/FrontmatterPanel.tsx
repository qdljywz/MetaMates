import React, { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Button, Empty } from 'antd'
import { parseFrontmatter, setFrontmatterProperty, type FrontmatterValue } from '../../services/frontmatter'

interface FrontmatterPanelProps {
  content: string
  onChange: (nextContent: string) => void
  isDark: boolean
  borderColor: string
  secondaryColor: string
}

const FrontmatterPanel = memo(({ content, onChange, borderColor, secondaryColor }: FrontmatterPanelProps) => {
  const { t } = useTranslation('editor')
  const parsed = parseFrontmatter(content)
  const [newKey, setNewKey] = useState('')

  useEffect(() => {
    // re-render when content changes
  }, [content])

  const updateProperty = (key: string, value: FrontmatterValue | undefined) => {
    onChange(setFrontmatterProperty(content, key, value))
  }

  const addProperty = () => {
    const key = newKey.trim()
    if (!key) return
    updateProperty(key, '')
    setNewKey('')
  }

  const entries = Object.entries(parsed.properties)

  return (
    <div style={{ padding: 8, overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
      {entries.length === 0 ? (
        <Empty description={t('properties.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        entries.map(([key, value]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 4 }}>{key}</div>
            <Input
              value={String(value)}
              onChange={(event) => updateProperty(key, event.target.value)}
              size="small"
            />
            <Button
              type="link"
              size="small"
              danger
              onClick={() => updateProperty(key, undefined)}
              style={{ paddingLeft: 0 }}
            >
              {t('properties.remove')}
            </Button>
          </div>
        ))
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Input
          placeholder={t('properties.newKey')}
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          size="small"
          onPressEnter={addProperty}
        />
        <Button size="small" onClick={addProperty}>{t('properties.add')}</Button>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: secondaryColor, borderTop: `1px solid ${borderColor}`, paddingTop: 8 }}>
        {t('properties.hint')}
      </div>
    </div>
  )
})

FrontmatterPanel.displayName = 'FrontmatterPanel'

export default FrontmatterPanel
