import React, { useEffect, useState } from 'react'
import { Spin, Empty } from 'antd'
import { useTranslation } from 'react-i18next'

interface PdfViewerProps {
  filePath: string
}

const PdfViewer: React.FC<PdfViewerProps> = ({ filePath }) => {
  const { t } = useTranslation('editor')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDataUrl(null)

    const load = async () => {
      if (!window.electronAPI?.readFileBase64) {
        setError(t('pdf.desktopOnly'))
        setLoading(false)
        return
      }
      const result = await window.electronAPI.readFileBase64(filePath)
      if (cancelled) return
      if (result.success && result.data) {
        const mime = result.mimeType || 'application/pdf'
        setDataUrl(`data:${mime};base64,${result.data}`)
      } else {
        setError(result.error || t('pdf.loadError'))
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [filePath, t])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 0 }}>
        <Spin tip={t('pdf.loading')} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, minHeight: 0, padding: 24 }}>
        <Empty description={error} />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <iframe
        title={filePath}
        src={dataUrl || undefined}
        style={{ width: '100%', height: '100%', border: 'none', background: 'var(--canvas-surface)' }}
      />
    </div>
  )
}

export default PdfViewer
