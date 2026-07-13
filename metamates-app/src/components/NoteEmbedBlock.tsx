import React, { memo, useEffect, useState } from 'react'

interface NoteEmbedBlockProps {
  note: string
  heading?: string
  blockId?: string
  alias?: string
  resolveNoteEmbed?: (note: string, options?: { heading?: string; blockId?: string }) => Promise<string | null>
}

const NoteEmbedBlock = memo(({ note, heading, blockId, alias, resolveNoteEmbed }: NoteEmbedBlockProps) => {
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
    <div className="note-embed-block">
      <div className="note-embed-block__label">
        ↳ {alias || note}{heading ? `#${heading}` : ''}{blockId ? `#^${blockId}` : ''}
      </div>
      {loading ? (
        <div className="note-embed-block__placeholder">...</div>
      ) : content ? (
        <pre className="note-embed-block__content">{content}</pre>
      ) : (
        <div className="note-embed-block__placeholder">—</div>
      )}
    </div>
  )
})

NoteEmbedBlock.displayName = 'NoteEmbedBlock'

export default NoteEmbedBlock
