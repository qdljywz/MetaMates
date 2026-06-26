import React, { useEffect, useState } from 'react'
import { Spin, Empty } from 'antd'

interface PdfViewerProps {
  filePath: string
}

const PdfViewer: React.FC<PdfViewerProps> = ({ filePath }) => {
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
        setError('PDF 预览仅在桌面端可用')
        setLoading(false)
        return
      }
      const result = await window.electronAPI.readFileBase64(filePath)
      if (cancelled) return
      if (result.success && result.data) {
        const mime = result.mimeType || 'application/pdf'
        setDataUrl(`data:${mime};base64,${result.data}`)
      } else {
        setError(result.error || '无法读取 PDF')
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [filePath])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin tip="加载 PDF..." />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description={error} />
      </div>
    )
  }

  return (
    <iframe
      title={filePath}
      src={dataUrl || undefined}
      style={{ width: '100%', height: '100%', border: 'none', background: '#1c1c1f' }}
    />
  )
}

export default PdfViewer
