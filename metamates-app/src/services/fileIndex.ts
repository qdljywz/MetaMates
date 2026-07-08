import { noteStemMatchesLink } from './linkIntelligence'
import { semanticSearchEngine } from './semanticSearch'

export interface FileIndex {
  name: string
  path: string
  content: string
  wordCount: number
  lastModified: number
  links: string[]
  tags: string[]
  headings: string[]
  tasks: { text: string; completed: boolean }[]
}

export interface IndexStats {
  totalFiles: number
  totalWords: number
  totalLinks: number
  totalTags: number
  totalTasks: number
  lastIndexed: number
}

export class FileIndexService {
  private index: Map<string, FileIndex> = new Map()
  private lastIndexed: number = 0
  
  async buildIndex(files: { name: string; path: string; content: string; lastModified?: number }[]): Promise<IndexStats> {
    this.index.clear()
    
    for (const file of files) {
      const indexed = this.indexFile(file)
      this.index.set(file.path, indexed)
    }
    
    this.lastIndexed = Date.now()
    this.rebuildSemanticIndex()
    
    return this.getStats()
  }

  private rebuildSemanticIndex(): void {
    const documents = Array.from(this.index.values()).map((file) => ({
      id: file.path,
      text: [file.name, ...file.headings, ...file.tags, file.content].join('\n'),
    }))
    semanticSearchEngine.build(documents)
  }
  
  private indexFile(file: { name: string; path: string; content: string; lastModified?: number }): FileIndex {
    const content = file.content
    
    const linkPattern = /\[\[([^\]]+)\]\]/g
    const links: string[] = []
    let linkMatch
    while ((linkMatch = linkPattern.exec(content)) !== null) {
      links.push(linkMatch[1])
    }
    
    const tagPattern = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g
    const tags: string[] = []
    let tagMatch
    while ((tagMatch = tagPattern.exec(content)) !== null) {
      tags.push(tagMatch[1])
    }
    
    const headingPattern = /^(#{1,6})\s+(.+)$/gm
    const headings: string[] = []
    let headingMatch
    while ((headingMatch = headingPattern.exec(content)) !== null) {
      headings.push(headingMatch[2].trim())
    }
    
    const taskPattern = /- \[([ xX])\]\s*(.+)/g
    const tasks: { text: string; completed: boolean }[] = []
    let taskMatch
    while ((taskMatch = taskPattern.exec(content)) !== null) {
      tasks.push({
        text: taskMatch[2].trim(),
        completed: taskMatch[1].toLowerCase() === 'x',
      })
    }
    
    const wordCount = content.length
    
    return {
      name: file.name,
      path: file.path,
      content,
      wordCount,
      lastModified: file.lastModified ?? Date.now(),
      links: [...new Set(links)],
      tags: [...new Set(tags)],
      headings,
      tasks,
    }
  }

  searchSemantic(query: string, limit = 20): { file: FileIndex; score: number }[] {
    const hits = semanticSearchEngine.search(query, limit)
    return hits
      .map((hit) => {
        const file = this.index.get(hit.id)
        return file ? { file, score: hit.score * 100 } : null
      })
      .filter((r): r is { file: FileIndex; score: number } => r !== null)
  }

  /** Semantic neighbors for link suggestions (uses title + headings + tags). */
  getSemanticNeighbors(filePath: string, limit = 10): { file: FileIndex; score: number }[] {
    const file = this.index.get(filePath)
    if (!file) return []
    const stem = file.name.replace(/\.md$/i, '')
    const query = [stem, ...file.headings.slice(0, 3), ...file.tags.slice(0, 3)].join(' ').trim()
    if (!query) return []
    return this.searchSemantic(query, limit + 1).filter((hit) => hit.file.path !== filePath).slice(0, limit)
  }

  /** Backlink count for a file path. */
  countBacklinks(filePath: string): number {
    return this.findBacklinks(filePath).length
  }

  /** Build semantic hit map for graph / link-debt batch analysis. */
  buildSemanticNeighborMap(limitPerFile = 5): Map<string, { file: FileIndex; score: number }[]> {
    const map = new Map<string, { file: FileIndex; score: number }[]>()
    for (const file of this.index.values()) {
      map.set(file.path, this.getSemanticNeighbors(file.path, limitPerFile))
    }
    return map
  }
  
  search(query: string, options: {
    caseSensitive?: boolean
    searchIn?: ('content' | 'links' | 'tags' | 'headings')[]
    limit?: number
  } = {}): { file: FileIndex; matches: string[]; score: number }[] {
    const {
      caseSensitive = false,
      searchIn = ['content', 'links', 'tags', 'headings'],
      limit = 20,
    } = options
    
    const results: { file: FileIndex; matches: string[]; score: number }[] = []
    const searchQuery = caseSensitive ? query : query.toLowerCase()
    
    for (const file of this.index.values()) {
      const matches: string[] = []
      let score = 0
      
      if (searchIn.includes('content')) {
        const content = caseSensitive ? file.content : file.content.toLowerCase()
        if (content.includes(searchQuery)) {
          matches.push('content')
          score += 10
          
          const regex = new RegExp(query, caseSensitive ? 'g' : 'gi')
          const count = (file.content.match(regex) || []).length
          score += count
        }
      }
      
      if (searchIn.includes('links')) {
        for (const link of file.links) {
          const linkText = caseSensitive ? link : link.toLowerCase()
          if (linkText.includes(searchQuery)) {
            matches.push(`link:${link}`)
            score += 5
          }
        }
      }
      
      if (searchIn.includes('tags')) {
        for (const tag of file.tags) {
          const tagText = caseSensitive ? tag : tag.toLowerCase()
          if (tagText.includes(searchQuery)) {
            matches.push(`tag:${tag}`)
            score += 5
          }
        }
      }
      
      if (searchIn.includes('headings')) {
        for (const heading of file.headings) {
          const headingText = caseSensitive ? heading : heading.toLowerCase()
          if (headingText.includes(searchQuery)) {
            matches.push(`heading:${heading}`)
            score += 3
          }
        }
      }
      
      if (matches.length > 0) {
        results.push({ file, matches, score })
      }
    }
    
    results.sort((a, b) => b.score - a.score)
    
    return results.slice(0, limit)
  }
  
  findByTag(tag: string): FileIndex[] {
    const results: FileIndex[] = []
    for (const file of this.index.values()) {
      if (file.tags.includes(tag)) {
        results.push(file)
      }
    }
    return results
  }
  
  findByLink(link: string): FileIndex[] {
    const results: FileIndex[] = []
    for (const file of this.index.values()) {
      if (file.links.some((l) => noteStemMatchesLink(l, link))) {
        results.push(file)
      }
    }
    return results
  }
  
  findBacklinks(filePath: string): FileIndex[] {
    const target = this.index.get(filePath)
    const targetName = target?.name ?? filePath.split(/[/\\]/).pop() ?? ''
    const results: FileIndex[] = []
    
    for (const file of this.index.values()) {
      if (file.path !== filePath && file.links.some((l) => noteStemMatchesLink(l, targetName))) {
        results.push(file)
      }
    }
    
    return results
  }
  
  getRelatedFiles(filePath: string, limit: number = 5): { file: FileIndex; relevance: number }[] {
    const targetFile = this.index.get(filePath)
    if (!targetFile) return []
    
    const scores: Map<string, number> = new Map()
    
    for (const link of targetFile.links) {
      const linkedFiles = this.findByLink(link)
      for (const file of linkedFiles) {
        if (file.path !== filePath) {
          scores.set(file.path, (scores.get(file.path) || 0) + 3)
        }
      }
    }
    
    for (const tag of targetFile.tags) {
      const taggedFiles = this.findByTag(tag)
      for (const file of taggedFiles) {
        if (file.path !== filePath) {
          scores.set(file.path, (scores.get(file.path) || 0) + 2)
        }
      }
    }
    
    const backlinks = this.findBacklinks(filePath)
    for (const file of backlinks) {
      scores.set(file.path, (scores.get(file.path) || 0) + 4)
    }
    
    const results = Array.from(scores.entries())
      .map(([path, relevance]) => ({
        file: this.index.get(path)!,
        relevance,
      }))
      .filter(r => r.file)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
    
    return results
  }
  
  getStats(): IndexStats {
    let totalWords = 0
    let totalLinks = 0
    let totalTags = 0
    let totalTasks = 0
    
    for (const file of this.index.values()) {
      totalWords += file.wordCount
      totalLinks += file.links.length
      totalTags += file.tags.length
      totalTasks += file.tasks.length
    }
    
    return {
      totalFiles: this.index.size,
      totalWords,
      totalLinks,
      totalTags,
      totalTasks,
      lastIndexed: this.lastIndexed,
    }
  }
  
  getFile(path: string): FileIndex | undefined {
    return this.index.get(path)
  }
  
  getAllFiles(): FileIndex[] {
    return Array.from(this.index.values())
  }
  
  getTopTags(limit: number = 10): { tag: string; count: number }[] {
    const tagCounts: Map<string, number> = new Map()
    
    for (const file of this.index.values()) {
      for (const tag of file.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
    
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }
  
  getRecentFiles(limit: number = 10): FileIndex[] {
    return this.getAllFiles()
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, limit)
  }
  
  getFilesWithPendingTasks(): FileIndex[] {
    return this.getAllFiles()
      .filter(f => f.tasks.some(t => !t.completed))
      .sort((a, b) => {
        const aPending = a.tasks.filter(t => !t.completed).length
        const bPending = b.tasks.filter(t => !t.completed).length
        return bPending - aPending
      })
  }

  /**
   * 更新或插入单个文件的索引条目
   */
  upsertFile(file: { name: string; path: string; content: string; lastModified?: number }): void {
    this.index.set(file.path, this.indexFile(file))
    this.lastIndexed = Date.now()
    this.rebuildSemanticIndex()
  }

  /**
   * 从索引中移除文件
   */
  removeFile(filePath: string): void {
    if (this.index.delete(filePath)) {
      this.lastIndexed = Date.now()
      this.rebuildSemanticIndex()
    }
  }

  hasFile(filePath: string): boolean {
    return this.index.has(filePath)
  }
}

export const fileIndexService = new FileIndexService()
