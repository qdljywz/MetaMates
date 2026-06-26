import React, { memo, useEffect, useState } from 'react'

interface NoteEmbedBlockProps {
  note: string
  heading?: string
  blockId?: string
  alias?: string
  resolveNoteEmbed?: (note: string, options?: { heading?: string; blockId?: string }) => Promise<string | null>
  isDark: boolean
}

const NoteEmbedBlock = memo(({ note, heading, blockId, alias, resolveNoteEmbed, isDark }: NoteEmbedBlockProps) => {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    void (async () => {
      if (!resolveNoteEmbed) {
        if (active) {
          setContent(null)
          setLoading(false)
        }
        return
      }
      const resolved = await resolveNoteEmbed(note, { heading, blockId })
      if (active) {
        setContent(resolved)
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [note, heading, blockId, resolveNoteEmbed])

  return (
    <div
      style={{
        margin: '8px 0',
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
        background: isDark ? '#181825' : '#fafafa',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
        ↳ {alias || note}{heading ? `#${heading}` : ''}{blockId ? `#^${blockId}` : ''}
      </div>
      {loading ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>...</div>
      ) : content ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: 'inherit' }}>{content}</pre>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.6 }}>—</div>
      )}
    </div>
  )
})

NoteEmbedBlock.displayName = 'NoteEmbedBlock'

export default NoteEmbedBlock
