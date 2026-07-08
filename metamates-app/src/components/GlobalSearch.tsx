import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal, Input, List, Tag, Empty, Spin, Switch } from 'antd'
import { SearchOutlined, FileOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../store/AppContext'
import { useTheme } from '../hooks/useTheme'
import { workspaceIndexService } from '../services/workspaceIndex'

interface SearchResult {
  path: string
  fileName: string
  matches: {
    line: number
    content: string
    highlight: string
  }[]
  score: number
  tags?: string[]
  semantic?: boolean
}

interface GlobalSearchProps {
  visible: boolean
  onClose: () => void
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ visible, onClose }) => {
  const { t } = useTranslation('common')
  const { state, dispatch } = useAppContext()
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const [searchText, setSearchText] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ totalFiles: number } | null>(null)
  const [includeConfig, setIncludeConfig] = useState(false)

  useEffect(() => {
    if (!visible) return

    if (workspaceIndexService.isReady()) {
      const indexStats = workspaceIndexService.getStats()
      if (indexStats) setStats({ totalFiles: indexStats.totalFiles })
      setLoading(false)
      return
    }

    if (!state.workspacePath) return

    setLoading(true)
    void workspaceIndexService.rebuild(state.workspacePath).then((indexStats) => {
      setStats({ totalFiles: indexStats.totalFiles })
      setLoading(false)
    })
  }, [visible, state.workspacePath])

  useEffect(() => {
    if (!visible) return
    const unsubscribe = workspaceIndexService.subscribe((indexStats) => {
      setStats({ totalFiles: indexStats.totalFiles })
    })
    return unsubscribe
  }, [visible])

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !workspaceIndexService.isReady()) {
      setResults([])
      return
    }

    const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const indexHits = await workspaceIndexService.search(query, 100, { includeConfig })
    const searchResults: SearchResult[] = []

    for (const hit of indexHits) {
      const lines = hit.file.content.split('\n')
      const matches: SearchResult['matches'] = []
      let lineScore = hit.score
      const isSemanticOnly = hit.score > 0 && !searchTerms.some((term) =>
        hit.file.content.toLowerCase().includes(term)
      )

      lines.forEach((line, lineIndex) => {
        const lowerLine = line.toLowerCase()
        let hasMatch = false

        searchTerms.forEach((term) => {
          if (lowerLine.includes(term)) {
            hasMatch = true
            lineScore += (lowerLine.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
          }
        })

        if (hasMatch) {
          let highlight = line
          searchTerms.forEach((term) => {
            const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
            highlight = highlight.replace(regex, '**$1**')
          })

          matches.push({
            line: lineIndex + 1,
            content: line.slice(0, 100),
            highlight,
          })
        }
      })

      if (matches.length === 0 && hit.score > 0) {
        const preview =
          hit.file.headings[0] ||
          lines.find((l) => l.trim())?.slice(0, 100) ||
          hit.file.content.slice(0, 100)
        matches.push({
          line: 0,
          content: preview,
          highlight: preview,
        })
      }

      if (matches.length > 0) {
        const fileName = hit.file.path.split(/[/\\]/).pop() || hit.file.path
        searchResults.push({
          path: hit.file.path,
          fileName,
          matches: matches.slice(0, 5),
          score: lineScore,
          tags: hit.file.tags.slice(0, 3),
          semantic: isSemanticOnly,
        })
      }
    }

    searchResults.sort((a, b) => b.score - a.score)
    setResults(searchResults.slice(0, 50))
  }, [includeConfig])

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchText)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText, includeConfig, performSearch])

  const handleResultClick = (path: string, fileName: string, line?: number) => {
    if (line && line > 0) {
      dispatch({
        type: 'OPEN_EDITOR_AT',
        payload: { path, name: fileName, line },
      })
    } else {
      dispatch({
        type: 'ADD_TAB',
        payload: { path, name: fileName, isDirty: false },
      })
    }
    onClose()
  }

  const highlightText = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g)
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <span
            key={index}
            style={{ background: isDark ? '#854d0e' : '#fef08a', padding: '0 2px' }}
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  const indexLabel = useMemo(() => {
    if (!stats) return null
    return t('search.indexLabel', { count: stats.totalFiles })
  }, [stats, t])

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchOutlined />
          <span>{t('actions.search')}</span>
          {indexLabel && (
            <Tag color="default" style={{ marginLeft: 'auto', fontWeight: 400 }}>
              {indexLabel}
            </Tag>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      styles={{
        body: { padding: '16px', maxHeight: '60vh', overflow: 'auto' },
      }}
    >
      <Input
        placeholder={t('search.placeholder')}
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        autoFocus
        size="large"
        style={{ marginBottom: 12 }}
        disabled={loading}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Switch size="small" checked={includeConfig} onChange={setIncludeConfig} />
        <span style={{ fontSize: 13, color: isDark ? '#a6adc8' : '#6b7280' }}>
          {t('search.includeConfig')}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin tip={t('search.buildingIndex')} />
        </div>
      ) : searchText.trim() ? (
        results.length > 0 ? (
          <List
            dataSource={results}
            renderItem={(result) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '12px 0', background: 'transparent' }}
                onClick={() => handleResultClick(
                  result.path,
                  result.fileName,
                  result.matches.find((match) => match.line > 0)?.line
                )}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <FileOutlined style={{ color: '#3b82f6' }} />
                    <span style={{ fontWeight: 500, color: isDark ? '#e6e6e6' : '#1f2937' }}>
                      {result.fileName}
                    </span>
                    <Tag color="blue">{result.matches.length}</Tag>
                    {result.semantic && (
                      <Tag color="purple">{t('search.semantic')}</Tag>
                    )}
                    {result.tags?.map((tag) => (
                      <Tag key={tag} color="green">
                        #{tag}
                      </Tag>
                    ))}
                  </div>
                  <div style={{ paddingLeft: 24 }}>
                    {result.matches.slice(0, 3).map((match, index) => (
                      <div
                        key={index}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleResultClick(result.path, result.fileName, match.line > 0 ? match.line : undefined)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            event.stopPropagation()
                            handleResultClick(result.path, result.fileName, match.line > 0 ? match.line : undefined)
                          }
                        }}
                        style={{
                          fontSize: 12,
                          color: isDark ? '#a6adc8' : '#6b7280',
                          marginBottom: 4,
                          background: isDark ? '#181825' : '#f9fafb',
                          padding: '4px 8px',
                          borderRadius: 4,
                        }}
                      >
                        <span style={{ color: isDark ? '#6b7280' : '#9ca3af', marginRight: 8 }}>
                          {match.line > 0 ? `L${match.line}:` : t('search.semanticMatch')}
                        </span>
                        {highlightText(match.highlight)}
                      </div>
                    ))}
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty description={t('messages.noSearchResults')} />
        )
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {t('actions.search')}
        </div>
      )}
    </Modal>
  )
}

export default GlobalSearch
