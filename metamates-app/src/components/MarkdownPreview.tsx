import React, { useMemo, useCallback } from 'react'
import { Typography, Tag, Divider, Checkbox, Table } from 'antd'
import NoteEmbedBlock from './NoteEmbedBlock'
import { stripFrontmatter } from '../services/embedResolver'

const { Title, Paragraph } = Typography

interface MarkdownPreviewProps {
  content: string
  onLinkClick?: (target: string) => void
  onTagClick?: (tag: string) => void
  resolveNoteEmbed?: (note: string, options?: { heading?: string; blockId?: string }) => Promise<string | null>
}

interface ParsedNode {
  type: 'heading' | 'paragraph' | 'list' | 'code' | 'blockquote' | 'hr' | 'checkbox' | 'link' | 'tag' | 'table' | 'embed'
  level?: number
  content?: React.ReactNode
  items?: ParsedNode[]
  checked?: boolean
  language?: string
  target?: string
  text?: string
  tagName?: string
  tableData?: { headers: string[]; rows: string[][] }
  note?: string
  blockId?: string
  heading?: string
  alias?: string
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, onLinkClick, onTagClick, resolveNoteEmbed }) => {
  const parseContent = useCallback((text: string): ParsedNode[] => {
    const lines = stripFrontmatter(text).split('\n')
    const nodes: ParsedNode[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      if (line.match(/^#{1,6}\s/)) {
        const match = line.match(/^(#{1,6})\s+(.+)$/)
        if (match) {
          nodes.push({
            type: 'heading',
            level: match[1].length,
            content: parseInline(match[2], onLinkClick, onTagClick),
          })
        }
        i++
        continue
      }

      if (line.match(/^```/)) {
        const match = line.match(/^```(\w*)/)
        const language = match?.[1] || ''
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeLines.push(lines[i])
          i++
        }
        nodes.push({
          type: 'code',
          language,
          content: codeLines.join('\n'),
        })
        i++
        continue
      }

      if (line.match(/^\|.*\|$/)) {
        const tableLines: string[] = []
        while (i < lines.length && lines[i].match(/^\|.*\|$/)) {
          tableLines.push(lines[i])
          i++
        }
        
        if (tableLines.length >= 2) {
          const headers = tableLines[0].split('|').map(h => h.trim()).filter(h => h)
          const rows = tableLines.slice(2).map(row => 
            row.split('|').map(cell => cell.trim()).filter(cell => cell)
          )
          
          nodes.push({
            type: 'table',
            tableData: { headers, rows }
          })
        }
        continue
      }

      if (line.match(/^- \[([ xX])\]\s/)) {
        const match = line.match(/^- \[([ xX])\]\s+(.+)$/)
        if (match) {
          nodes.push({
            type: 'checkbox',
            checked: match[1].toLowerCase() === 'x',
            content: parseInline(match[2], onLinkClick, onTagClick),
          })
        }
        i++
        continue
      }

      if (line.match(/^- \s/)) {
        const items: ParsedNode[] = []
        while (i < lines.length && lines[i].match(/^- \s/)) {
          const match = lines[i].match(/^- \s+(.+)$/)
          if (match) {
            items.push({
              type: 'paragraph',
              content: parseInline(match[1], onLinkClick, onTagClick),
            })
          }
          i++
        }
        nodes.push({ type: 'list', items })
        continue
      }

      if (line.match(/^\d+\.\s/)) {
        const items: ParsedNode[] = []
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          const match = lines[i].match(/^\d+\.\s+(.+)$/)
          if (match) {
            items.push({
              type: 'paragraph',
              content: parseInline(match[1], onLinkClick, onTagClick),
            })
          }
          i++
        }
        nodes.push({ type: 'list', items })
        continue
      }

      if (line.match(/^>\s/)) {
        const match = line.match(/^>\s+(.+)$/)
        if (match) {
          nodes.push({
            type: 'blockquote',
            content: parseInline(match[1], onLinkClick, onTagClick),
          })
        }
        i++
        continue
      }

      if (line.match(/^---+$/)) {
        nodes.push({ type: 'hr' })
        i++
        continue
      }

      if (line.trim() === '') {
        i++
        continue
      }

      const embedLine = line.match(/^!\[\[([^\]|]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/)
      if (embedLine) {
        const suffix = embedLine[2]
        nodes.push({
          type: 'embed',
          note: embedLine[1],
          blockId: suffix?.startsWith('^') ? suffix.slice(1) : undefined,
          heading: suffix && !suffix.startsWith('^') ? suffix : undefined,
          alias: embedLine[3],
        })
        i++
        continue
      }

      nodes.push({
        type: 'paragraph',
        content: parseInline(line, onLinkClick, onTagClick),
      })
      i++
    }

    return nodes
  }, [onLinkClick, onTagClick])

  const parseInline = (text: string, linkHandler?: (target: string) => void, tagHandler?: (tag: string) => void): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
      const embedMatch = remaining.match(/!\[\[([^\]|]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/)
      const wikiLinkMatch = remaining.match(/\[\[([^\]|]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/)
      const tagMatch = remaining.match(/#([a-zA-Z0-9_\u4e00-\u9fa5]+)/)
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/)
      const italicMatch = remaining.match(/\*([^*]+)\*/)
      const codeMatch = remaining.match(/`([^`]+)`/)
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)

      const matches: { index: number; length: number; render: () => React.ReactNode }[] = []

      if (embedMatch && embedMatch.index !== undefined) {
        const note = embedMatch[1]
        const suffix = embedMatch[2]
        const blockId = suffix?.startsWith('^') ? suffix.slice(1) : undefined
        const heading = suffix && !suffix.startsWith('^') ? suffix : undefined
        const alias = embedMatch[3]
        matches.push({
          index: embedMatch.index,
          length: embedMatch[0].length,
          render: () => (
            <NoteEmbedBlock
              key={key++}
              note={note}
              heading={heading}
              blockId={blockId}
              alias={alias}
              resolveNoteEmbed={resolveNoteEmbed}
            />
          ),
        })
      }

      if (wikiLinkMatch && wikiLinkMatch.index !== undefined) {
        const note = wikiLinkMatch[1]
        const suffix = wikiLinkMatch[2]
        const blockId = suffix?.startsWith('^') ? suffix.slice(1) : undefined
        const heading = suffix && !suffix.startsWith('^') ? suffix : undefined
        const display = wikiLinkMatch[3] || (suffix ? `${note}#${suffix}` : note)
        matches.push({
          index: wikiLinkMatch.index,
          length: wikiLinkMatch[0].length,
          render: () => (
            <a
              key={key++}
              className="md-wiki-link"
              onClick={() => linkHandler?.(suffix ? `${note}#${suffix}` : note)}
            >
              {display}
            </a>
          ),
        })
      }

      if (tagMatch && tagMatch.index !== undefined) {
        matches.push({
          index: tagMatch.index,
          length: tagMatch[0].length,
          render: () => (
            <Tag
              key={key++}
              className="md-tag-chip"
              onClick={() => tagHandler?.(tagMatch[1])}
            >
              #{tagMatch[1]}
            </Tag>
          ),
        })
      }

      if (boldMatch && boldMatch.index !== undefined) {
        matches.push({
          index: boldMatch.index,
          length: boldMatch[0].length,
          render: () => <strong key={key++} className="md-preview-strong">{boldMatch[1]}</strong>,
        })
      }

      if (italicMatch && italicMatch.index !== undefined) {
        matches.push({
          index: italicMatch.index,
          length: italicMatch[0].length,
          render: () => <em key={key++} className="md-preview-em">{italicMatch[1]}</em>,
        })
      }

      if (codeMatch && codeMatch.index !== undefined) {
        matches.push({
          index: codeMatch.index,
          length: codeMatch[0].length,
          render: () => (
            <code key={key++} className="md-preview-inline-code">
              {codeMatch[1]}
            </code>
          ),
        })
      }

      if (linkMatch && linkMatch.index !== undefined) {
        matches.push({
          index: linkMatch.index,
          length: linkMatch[0].length,
          render: () => (
            <a
              key={key++}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: 'var(--secondary-accent)',
                textDecoration: 'none',
                borderBottom: '1px dashed var(--secondary-accent)',
              }}
            >
              {linkMatch[1]}
            </a>
          ),
        })
      }

      if (matches.length === 0) {
        parts.push(remaining)
        break
      }

      const earliest = matches.sort((a, b) => a.index - b.index)[0]

      if (earliest.index > 0) {
        parts.push(remaining.slice(0, earliest.index))
      }

      parts.push(earliest.render())
      remaining = remaining.slice(earliest.index + earliest.length)
    }

    return parts.length > 0 ? parts : text
  }

  const renderNode = (node: ParsedNode, index: number): React.ReactNode => {
    switch (node.type) {
      case 'heading':
        const headingStyles: Record<number, React.CSSProperties> = {
          1: { fontSize: '2.25em', marginBottom: 24, marginTop: 32, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' },
          2: { fontSize: '1.75em', marginBottom: 20, marginTop: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
          3: { fontSize: '1.375em', marginBottom: 16, marginTop: 24, fontWeight: 600, color: 'var(--text-primary)' },
          4: { fontSize: '1.125em', marginBottom: 12, marginTop: 20, fontWeight: 600, color: 'var(--text-secondary)' },
          5: { fontSize: '1em', marginBottom: 10, marginTop: 16, fontWeight: 600, color: 'var(--text-muted)' },
          6: { fontSize: '0.875em', marginBottom: 8, marginTop: 12, fontWeight: 600, color: 'var(--text-dim)' },
        }
        
        return (
          <Title key={index} level={node.level as 1 | 2 | 3 | 4 | 5} style={headingStyles[node.level || 1]}>
            {node.content}
          </Title>
        )

      case 'paragraph':
        return (
          <Paragraph key={index} style={{ 
            marginBottom: 16, 
            lineHeight: 1.75,
            color: 'var(--text-primary)',
            fontSize: '1em',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}>
            {node.content}
          </Paragraph>
        )

      case 'list':
        return (
          <div key={index} style={{ marginBottom: 16, paddingLeft: 8 }}>
            {node.items?.map((item, i) => (
              <div key={i} style={{ 
                marginLeft: 20, 
                marginBottom: 8,
                position: 'relative',
                lineHeight: 1.6,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}>
                <span style={{ 
                  position: 'absolute', 
                  left: -16, 
                  color: 'var(--accent)',
                  fontWeight: 'bold',
                }}>•</span>
                {item.content}
              </div>
            ))}
          </div>
        )

      case 'checkbox':
        return (
          <div key={index} style={{ marginBottom: 6, marginLeft: 20 }}>
            <Checkbox 
              checked={node.checked} 
              style={{ 
                color: node.checked ? 'var(--success)' : undefined,
              }}
            >
              <span style={{ 
                textDecoration: node.checked ? 'line-through' : 'none', 
                opacity: node.checked ? 0.6 : 1,
                color: node.checked ? 'var(--text-dim)' : 'var(--text-primary)',
              }}>
                {node.content}
              </span>
            </Checkbox>
          </div>
        )

      case 'code':
        return (
          <div key={index} style={{ marginBottom: 20 }}>
            {node.language && (
              <div className="md-code-lang">
                {node.language}
              </div>
            )}
            <pre className={`md-code-block${node.language ? ' md-code-block--with-lang' : ''}`}>
              <code>{node.content}</code>
            </pre>
          </div>
        )

      case 'blockquote':
        return (
          <div key={index} className="md-blockquote">
            {node.content}
          </div>
        )

      case 'hr':
        return <Divider key={index} style={{ margin: '32px 0', borderColor: 'var(--divider-strong)' }} />

      case 'embed':
        return (
          <NoteEmbedBlock
            key={index}
            note={node.note || ''}
            heading={node.heading}
            blockId={node.blockId}
            alias={node.alias}
            resolveNoteEmbed={resolveNoteEmbed}
          />
        )

      case 'table':
        if (!node.tableData) return null
        const { headers, rows } = node.tableData
        const columns = headers.map((h, i) => ({
          title: h,
          dataIndex: i,
          key: i,
        }))
        const dataSource = rows.map((row, i) => ({
          key: i,
          ...row.reduce((acc, cell, j) => ({ ...acc, [j]: cell }), {}),
        }))
        
        return (
          <div key={index} className="md-table-wrap">
            <Table 
              columns={columns} 
              dataSource={dataSource} 
              pagination={false}
              size="small"
            />
          </div>
        )

      default:
        return null
    }
  }

  const nodes = useMemo(() => parseContent(content), [content, parseContent])

  return (
    <div className="markdown-preview">
      {nodes.map((node, index) => renderNode(node, index))}
    </div>
  )
}

export default MarkdownPreview
