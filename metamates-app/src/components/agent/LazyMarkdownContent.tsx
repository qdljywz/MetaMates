import React, { memo, useEffect, useRef, useState } from 'react'
import { getCachedMarkdown } from '../../utils/markdownCache'

interface LazyMarkdownContentProps {
  content: string
  renderMarkdown: (text: string) => string
  eager?: boolean
}

/** Parse markdown only when the bubble scrolls into view (or when eager for streaming). */
const LazyMarkdownContent = memo(({ content, renderMarkdown, eager = false }: LazyMarkdownContentProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)

  useEffect(() => {
    if (eager) {
      setVisible(true)
      return
    }
    const el = ref.current
    if (!el) return

    const root = el.closest('[data-message-list-root]') as Element | null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { root, rootMargin: '240px 0px 120px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [content, eager])

  if (!visible) {
    const preview = content.length > 320 ? `${content.slice(0, 320)}…` : content
    return (
      <div ref={ref} className="markdown-content markdown-content--placeholder">
        <p className="agent-panel__markdown-preview">{preview}</p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: getCachedMarkdown(content, renderMarkdown) }}
    />
  )
})

LazyMarkdownContent.displayName = 'LazyMarkdownContent'

export default LazyMarkdownContent
