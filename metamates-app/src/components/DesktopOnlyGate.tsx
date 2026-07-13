import React from 'react'
import { Result, Typography } from 'antd'
import { DesktopOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Paragraph, Text } = Typography

/**
 * Shown when the renderer runs outside Electron (e.g. `npm run dev` in a browser).
 * MetaMates is a desktop app; browser-only mode cannot access the filesystem or ACP.
 */
const DesktopOnlyGate: React.FC = () => {
  const { t } = useTranslation('desktop')

  return (
    <div className="desktop-only-gate">
      <Result
        icon={<DesktopOutlined style={{ color: 'var(--accent)' }} />}
        title={t('title')}
        subTitle={
          <>
            <Paragraph type="secondary">{t('subtitle')}</Paragraph>
            <Paragraph type="warning" style={{ marginTop: 12, marginBottom: 0 }}>
              {t('browserHint')}
            </Paragraph>
          </>
        }
        extra={
          <div style={{ maxWidth: 480, textAlign: 'left' }}>
            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {t('runHint')}
            </Paragraph>
            <Paragraph>
              <Text code>npm run start</Text>
              <br />
              <Text type="secondary">{t('or')}</Text>{' '}
              <Text code>npm run electron:dev</Text>
            </Paragraph>
            <Paragraph type="secondary" style={{ marginTop: 16, fontSize: 13 }}>
              {t('footer')}
            </Paragraph>
          </div>
        }
      />
    </div>
  )
}

export default DesktopOnlyGate
