import React from 'react'
import { Modal, Tabs, Typography, Divider, Space, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  BulbOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  BookOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography
const { TabPane } = Tabs

interface HelpModalProps {
  visible: boolean
  onClose: () => void
}

const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation('help')

  return (
    <Modal
      title={
        <Space>
          <QuestionCircleOutlined style={{ color: '#ff7a00' }} />
          <span>{t('title')}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
    >
      <Tabs defaultActiveKey="quickstart" tabPosition="left">
        <TabPane
          tab={<Space><RocketOutlined /> {t('tabs.quickstart')}</Space>}
          key="quickstart"
        >
          <Title level={4} style={{ marginBottom: 8 }}>{t('welcome.title')}</Title>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            {t('welcome.description')}
          </Paragraph>
          
          <div style={{ lineHeight: 2.2 }}>
            <div><Text strong>{t('gettingStarted.step1')}</Text> — <Text type="secondary">{t('gettingStarted.step1Desc')}</Text></div>
            <div><Text strong>{t('gettingStarted.step2')}</Text> — <Text type="secondary">{t('gettingStarted.step2Desc')}</Text></div>
            <div><Text strong>{t('gettingStarted.step3')}</Text> — <Text type="secondary">{t('gettingStarted.step3Desc')}</Text></div>
            <div><Text strong>{t('gettingStarted.step4')}</Text> — <Text type="secondary">{t('gettingStarted.step4Desc')}</Text></div>
          </div>
        </TabPane>

        <TabPane
          tab={<Space><BulbOutlined /> {t('tabs.features')}</Space>}
          key="features"
        >
          <Title level={5} style={{ marginBottom: 12 }}>{t('editor.title')}</Title>
          <div style={{ lineHeight: 2, marginBottom: 20 }}>
            <div><Text code>{t('editor.realtimeRender')}</Text> — <Text type="secondary">{t('editor.realtimeRenderDesc')}</Text></div>
            <div><Text code>{t('editor.wikiLink')}</Text> — <Text type="secondary">{t('editor.wikiLinkDesc')}</Text></div>
            <div><Text code>{t('editor.tags')}</Text> — <Text type="secondary">{t('editor.tagsDesc')}</Text></div>
            <div><Text code>{t('editor.autoSave')}</Text> — <Text type="secondary">{t('editor.autoSaveDesc')}</Text></div>
          </div>

          <Title level={5} style={{ marginBottom: 12 }}>{t('features.title')}</Title>
          <div style={{ lineHeight: 2 }}>
            <div>📁 {t('features.fileTree')}</div>
            <div>🔍 {t('features.search')}</div>
            <div>📊 {t('features.graph')}</div>
            <div>📅 {t('features.calendar')}</div>
            <div>🤖 {t('features.ai')}</div>
            <div>🧠 {t('features.memory')}</div>
          </div>
        </TabPane>

        <TabPane
          tab={<Space><BookOutlined /> {t('tabs.syntax')}</Space>}
          key="syntax"
        >
          <Title level={5} style={{ marginBottom: 12 }}>{t('markdown.title')}</Title>
          <div style={{ lineHeight: 2, marginBottom: 20 }}>
            <div><Text code># H1</Text> <Text code>## H2</Text> <Text code>### H3</Text> — {t('markdown.heading')}</div>
            <div><Text code>**{t('markdown.bold')}**</Text> — {t('markdown.bold')}</div>
            <div><Text code>*{t('markdown.italic')}*</Text> — {t('markdown.italic')}</div>
            <div><Text code>~~{t('markdown.strikethrough')}~~</Text> — {t('markdown.strikethrough')}</div>
            <div><Text code>=={t('markdown.highlight')}==</Text> — {t('markdown.highlight')}</div>
            <div><Text code>- {t('markdown.unorderedList')}</Text> — {t('markdown.unorderedList')}</div>
            <div><Text code>1. {t('markdown.orderedList')}</Text> — {t('markdown.orderedList')}</div>
            <div><Text code>- [ ] {t('markdown.todo')}</Text> — {t('markdown.todo')}</div>
          </div>

          <Title level={5} style={{ marginBottom: 12 }}>{t('extendedSyntax.title')}</Title>
          <div style={{ lineHeight: 2 }}>
            <div><Text code>{t('extendedSyntax.wikiLinkExample')}</Text> — {t('extendedSyntax.wikiLink')}</div>
            <div><Text code>{t('extendedSyntax.tagExample')}</Text> — {t('extendedSyntax.tag')}</div>
            <div><Text code>{t('extendedSyntax.highlightExample')}</Text> — {t('extendedSyntax.highlight')}</div>
          </div>
        </TabPane>

        <TabPane
          tab={<Space><ThunderboltOutlined /> {t('tabs.shortcuts')}</Space>}
          key="shortcuts"
        >
          <div style={{ lineHeight: 2.5 }}>
            <div><Tag color="orange">Ctrl + P</Tag> {t('shortcuts.commandPalette')}</div>
            <div><Tag color="orange">Ctrl + N</Tag> {t('shortcuts.newNote')}</div>
            <div><Tag color="orange">Ctrl + F</Tag> {t('shortcuts.find')}</div>
            <div><Tag color="orange">Ctrl + Shift + F</Tag> {t('shortcuts.globalSearch')}</div>
            <div><Tag color="orange">Ctrl + B</Tag> {t('shortcuts.toggleFileTree')}</div>
            <div><Tag color="orange">Ctrl + Shift + L</Tag> {t('shortcuts.toggleTheme')}</div>
          </div>
        </TabPane>
      </Tabs>

      <Divider style={{ margin: '16px 0 8px' }} />
      
      <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
        <Space split={<Divider type="vertical" />}>
          <span>{t('version')} 0.1.0</span>
          <a href="https://github.com/metamates/metamates-app" target="_blank" rel="noopener noreferrer">{t('github')}</a>
          <a href="https://github.com/metamates/metamates-app/issues" target="_blank" rel="noopener noreferrer">{t('feedback')}</a>
        </Space>
      </div>
    </Modal>
  )
}

export default HelpModal
