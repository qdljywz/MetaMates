import React, { useMemo, useCallback } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import { useTheme } from '../hooks/useTheme'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('tsx', typescript)

const renderer = new marked.Renderer()
renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<pre><code class="language-${language}">${highlighted}</code></pre>`
}

marked.setOptions({
  renderer,
  breaks: true,
  gfm: true,
})

interface MarkdownRendererProps {
  content: string
  showCopyButton?: boolean
  className?: string
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ 
  content, 
  showCopyButton = true,
  className = ''
}) => {
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const [copiedBlocks, setCopiedBlocks] = React.useState<Set<number>>(new Set())

  const html = useMemo(() => {
    try {
      return marked.parse(content) as string
    } catch {
      return content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    }
  }, [content])

  const copyToClipboard = useCallback(async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedBlocks(prev => new Set([...prev, index]))
      setTimeout(() => {
        setCopiedBlocks(prev => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, []  )

  const handleCopyAll = useCallback(async () => {
    await copyToClipboard(content, -1)
  }, [content, copyToClipboard])

  const addCodeCopyButtons = (htmlContent: string): string => {
    let codeBlockIndex = 0
    return htmlContent.replace(
      /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
      (_match, lang, code) => {
        const index = codeBlockIndex++
        const decodedCode = code
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
        
        const buttonId = `copy-${index}`
        const isCopied = copiedBlocks.has(index)
        
        return `
          <div style="position: relative; margin: 12px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: ${isDark ? '#1e1e1e' : '#f5f5f5'}; border-bottom: 1px solid ${isDark ? '#333' : '#e0e0e0'}; border-radius: 8px 8px 0 0;">
              <span style="font-size: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'}; font-family: monospace;">${lang}</span>
              <button 
                id="${buttonId}"
                onclick="(function(btn, code){navigator.clipboard.writeText(code).then(()=>{btn.innerHTML='✓ Copied';setTimeout(()=>btn.innerHTML='📋 Copy',2000)}).catch(()=>{})})(document.getElementById('${buttonId}'), ${JSON.stringify(decodedCode)})"
                style="
                  background: transparent;
                  border: 1px solid ${isDark ? '#444' : '#ddd'};
                  color: ${isDark ? '#9ca3af' : '#6b7280'};
                  padding: 4px 8px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 12px;
                  transition: all 0.2s;
                "
                onmouseover="this.style.background='${isDark ? '#333' : '#eee'}'"
                onmouseout="this.style.background='transparent'"
              >
                📋 Copy
              </button>
            </div>
            <pre style="margin: 0; padding: 12px; background: ${isDark ? '#0d1117' : '#fafafa'}; border-radius: 0 0 8px 8px; overflow-x: auto;"><code class="language-${lang}">${code}</code></pre>
          </div>
        `
      }
    )
  }

  const processedHtml = useMemo(() => {
    return addCodeCopyButtons(html)
  }, [html, isDark, copiedBlocks])

  return (
    <div className={className}>
      <style>{`
        .markdown-content {
          line-height: 1.6;
          font-size: 14px;
          color: ${isDark ? '#e6e6e6' : '#1f2937'};
        }
        .markdown-content p {
          margin: 0 0 8px 0;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content code {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'};
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: ${isDark ? '#f472b6' : '#d946ef'};
        }
        .markdown-content pre {
          margin: 12px 0;
          padding: 0;
          background: transparent;
          overflow-x: auto;
        }
        .markdown-content pre code {
          background: transparent;
          padding: 0;
          color: inherit;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 8px 0;
          padding-left: 20px;
        }
        .markdown-content li {
          margin: 4px 0;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3, 
        .markdown-content h4, .markdown-content h5, .markdown-content h6 {
          margin: 16px 0 8px 0;
          font-weight: 600;
          line-height: 1.3;
        }
        .markdown-content h1 { font-size: 1.5em; }
        .markdown-content h2 { font-size: 1.3em; }
        .markdown-content h3 { font-size: 1.15em; }
        .markdown-content h4 { font-size: 1.05em; }
        .markdown-content blockquote {
          border-left: 3px solid ${isDark ? '#ff8c28' : '#ff7a00'};
          padding-left: 12px;
          margin: 8px 0;
          color: ${isDark ? '#a6adc8' : '#6b7280'};
          font-style: italic;
        }
        .markdown-content a {
          color: ${isDark ? '#ff8c28' : '#ff7a00'};
          text-decoration: none;
        }
        .markdown-content a:hover {
          text-decoration: underline;
        }
        .markdown-content table {
          border-collapse: collapse;
          margin: 12px 0;
          width: 100%;
        }
        .markdown-content th, .markdown-content td {
          border: 1px solid ${isDark ? '#333' : '#e5e7eb'};
          padding: 8px 12px;
          text-align: left;
        }
        .markdown-content th {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'};
          font-weight: 600;
        }
        .markdown-content hr {
          border: none;
          border-top: 1px solid ${isDark ? '#333' : '#e5e7eb'};
          margin: 16px 0;
        }
        .markdown-content img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
        .markdown-content strong {
          font-weight: 600;
          color: ${isDark ? '#fcd34d' : '#b45309'};
        }
        .markdown-content em {
          font-style: italic;
        }
        /* highlight.js styles */
        .hljs {
          background: ${isDark ? '#0d1117' : '#fafafa'} !important;
          color: ${isDark ? '#c9d1d9' : '#24292e'} !important;
        }
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-built_in,
        .hljs-name,
        .hljs-tag {
          color: ${isDark ? '#ff7b72' : '#d73a49'} !important;
        }
        .hljs-string,
        .hljs-title,
        .hljs-section,
        .hljs-attribute,
        .hljs-literal,
        .hljs-template-tag,
        .hljs-template-variable,
        .hljs-type,
        .hljs-addition {
          color: ${isDark ? '#a5d6ff' : '#22863a'} !important;
        }
        .hljs-deletion,
        .hljs-selector-attr,
        .hljs-selector-pseudo,
        .hljs-meta {
          color: ${isDark ? '#ffa657' : '#e36209'} !important;
        }
        .hljs-comment,
        .hljs-quote {
          color: ${isDark ? '#8b949e' : '#6a737d'} !important;
          font-style: italic;
        }
        .hljs-number,
        .hljs-regexp,
        .hljs-selector-id,
        .hljs-variable {
          color: ${isDark ? '#79c0ff' : '#005cc5'} !important;
        }
        .hljs-function {
          color: ${isDark ? '#d2a8ff' : '#6f42c1'} !important;
        }
        .hljs-params {
          color: ${isDark ? '#e6e6e6' : '#24292e'} !important;
        }
        .hljs-class .hljs-title {
          color: ${isDark ? '#ffa657' : '#005cc5'} !important;
        }
      `}</style>
      
      <div 
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
      
      {showCopyButton && (
        <button
          onClick={handleCopyAll}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'transparent',
            border: 'none',
            color: isDark ? '#6b7280' : '#9ca3af',
            padding: '4px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            opacity: 0.7,
            transition: 'opacity 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseOut={(e) => (e.currentTarget.style.opacity = '0.7')}
          title="Copy all"
        >
          {copiedBlocks.has(-1) ? '✓ Copied' : '📋 Copy All'}
        </button>
      )}
    </div>
  )
}

export default MarkdownRenderer
