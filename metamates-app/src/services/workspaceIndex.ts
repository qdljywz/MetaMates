import { fileIndexService, type IndexStats } from './fileIndex'
import { analyzePotentialLinks, rankLinkDebt, type LinkDebtScore, type PotentialLink } from './linkIntelligence'
import type { FileChangeEvent } from '../types/electron'
import type { WorkspaceLanguage } from '../constants/paths'
import {
  detectWorkspaceLanguageFromPaths,
  isVaultContentFile,
} from './vaultPaths'

type IndexListener = (stats: IndexStats) => void
type VaultChangeListener = () => void

/**
 * 工作区索引管理：全量构建 + 文件监听增量更新
 */
class WorkspaceIndexService {
  private workspacePath = ''
  private workspaceLanguage: WorkspaceLanguage = 'zh'
  private building = false
  private ready = false
  private indexListeners = new Set<IndexListener>()
  private vaultChangeListeners = new Set<VaultChangeListener>()
  private detachWatch: (() => void) | null = null
  private pendingUpdateTimer: ReturnType<typeof setTimeout> | null = null

  isReady(): boolean {
    return this.ready
  }

  isBuilding(): boolean {
    return this.building
  }

  getWorkspacePath(): string {
    return this.workspacePath
  }

  getStats(): IndexStats | null {
    if (!this.ready) return null
    return fileIndexService.getStats()
  }

  subscribe(listener: IndexListener): () => void {
    this.indexListeners.add(listener)
    const stats = this.getStats()
    if (stats) listener(stats)
    return () => this.indexListeners.delete(listener)
  }

  onVaultChanged(listener: VaultChangeListener): () => void {
    this.vaultChangeListeners.add(listener)
    return () => this.vaultChangeListeners.delete(listener)
  }

  private notifyIndexListeners(): void {
    const stats = fileIndexService.getStats()
    this.indexListeners.forEach((listener) => listener(stats))
  }

  private notifyVaultChanged(): void {
    this.vaultChangeListeners.forEach((listener) => listener())
  }

  /**
   * 绑定工作区：构建索引并启动文件监听
   */
  async attachWorkspace(workspacePath: string): Promise<IndexStats | null> {
    if (!window.electronAPI) return null

    this.detach()

    this.workspacePath = workspacePath
    const stats = await this.rebuild(workspacePath)

    await window.electronAPI.watchDirectory(workspacePath)

    const handleFileChange = (event: FileChangeEvent) => {
      this.scheduleIncrementalUpdate(event)
      this.notifyVaultChanged()
    }

    window.electronAPI.onFileChanged(handleFileChange)

    this.detachWatch = () => {
      window.electronAPI?.removeFileChangedListener()
      window.electronAPI?.unwatchDirectory()
    }

    return stats
  }

  detach(): void {
    if (this.pendingUpdateTimer) {
      clearTimeout(this.pendingUpdateTimer)
      this.pendingUpdateTimer = null
    }
    if (this.detachWatch) {
      this.detachWatch()
      this.detachWatch = null
    }
    this.workspacePath = ''
    this.ready = false
  }

  /**
   * 全量重建索引
   */
  async rebuild(workspacePath: string): Promise<IndexStats> {
    if (!window.electronAPI) {
      return fileIndexService.getStats()
    }

    this.building = true
    this.ready = false
    this.workspacePath = workspacePath

    try {
      const result = await window.electronAPI.listFiles(workspacePath, true)
      const indexedFiles: { name: string; path: string; content: string }[] = []

      if (result.success && result.files) {
        this.workspaceLanguage = detectWorkspaceLanguageFromPaths(
          workspacePath,
          result.files.map((f) => f.path),
        )
        const mdFiles = result.files.filter(
          (f) =>
            !f.isDirectory &&
            f.name.endsWith('.md') &&
            isVaultContentFile(workspacePath, f.path, this.workspaceLanguage),
        )
        for (const f of mdFiles) {
          const content = await window.electronAPI.readFile(f.path)
          if (content.success && content.content !== undefined) {
            indexedFiles.push({ name: f.name, path: f.path, content: content.content })
          }
        }
      }

      const stats = await fileIndexService.buildIndex(indexedFiles)
      this.ready = true
      this.notifyIndexListeners()
      return stats
    } finally {
      this.building = false
    }
  }

  /**
   * 防抖增量更新（文件变更后）
   */
  private scheduleIncrementalUpdate(event: FileChangeEvent): void {
    if (this.pendingUpdateTimer) {
      clearTimeout(this.pendingUpdateTimer)
    }
    this.pendingUpdateTimer = setTimeout(() => {
      this.pendingUpdateTimer = null
      void this.applyFileChange(event)
    }, 300)
  }

  private async applyFileChange(event: FileChangeEvent): Promise<void> {
    if (!window.electronAPI || !this.workspacePath) return

    const filePath = await window.electronAPI.path.join(event.dirPath, event.filename)
    const isMarkdown = filePath.endsWith('.md')
    const isVaultContent =
      isMarkdown &&
      isVaultContentFile(this.workspacePath, filePath, this.workspaceLanguage)

    if (!isMarkdown || !isVaultContent) {
      if (fileIndexService.hasFile(filePath)) {
        fileIndexService.removeFile(filePath)
        this.notifyIndexListeners()
      }
      return
    }

    const exists = await window.electronAPI.fileExists(filePath)
    if (!exists.exists) {
      fileIndexService.removeFile(filePath)
      this.notifyIndexListeners()
      return
    }

    const readResult = await window.electronAPI.readFile(filePath)
    if (readResult.success && readResult.content !== undefined) {
      const name = event.filename.split(/[/\\]/).pop() || event.filename
      fileIndexService.upsertFile({ name, path: filePath, content: readResult.content })
      this.ready = true
      this.notifyIndexListeners()
    }
  }

  async search(query: string, limit = 50, options?: { includeConfig?: boolean }) {
    if (!this.ready) return []
    const keywordHits = fileIndexService.search(query, { limit })
    const semanticHits = fileIndexService.searchSemantic(query, limit)

    const merged = new Map<string, { file: typeof keywordHits[0]['file']; score: number }>()

    for (const hit of keywordHits) {
      merged.set(hit.file.path, { file: hit.file, score: hit.score })
    }
    for (const hit of semanticHits) {
      const existing = merged.get(hit.file.path)
      if (existing) {
        existing.score += hit.score
      } else {
        merged.set(hit.file.path, { file: hit.file, score: hit.score })
      }
    }

    const vaultResults = Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((h) => ({ file: h.file, matches: ['content'] as string[], score: h.score }))

    if (!options?.includeConfig || !window.electronAPI || !this.workspacePath) {
      return vaultResults
    }

    return this.mergeConfigSearchResults(query, vaultResults, limit)
  }

  /**
   * 在知识层结果之外追加配置层关键词命中（无语义索引）
   */
  private async mergeConfigSearchResults(
    query: string,
    vaultResults: Array<{ file: { path: string; name: string; content: string; headings: string[]; tags: string[] }; matches: string[]; score: number }>,
    limit: number,
  ) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return vaultResults

    const merged = new Map(vaultResults.map((hit) => [hit.file.path, hit]))
    const listResult = await window.electronAPI!.listFiles(this.workspacePath, true)
    if (!listResult.success || !listResult.files) {
      return vaultResults
    }

    const configFiles = listResult.files.filter(
      (f) =>
        !f.isDirectory &&
        f.name.endsWith('.md') &&
        !isVaultContentFile(this.workspacePath, f.path, this.workspaceLanguage),
    )

    for (const file of configFiles) {
      if (merged.has(file.path)) continue
      const readResult = await window.electronAPI!.readFile(file.path)
      if (!readResult.success || readResult.content === undefined) continue
      const lower = readResult.content.toLowerCase()
      let score = 0
      for (const term of terms) {
        if (lower.includes(term)) score += 1
      }
      if (score <= 0) continue
      merged.set(file.path, {
        file: {
          path: file.path,
          name: file.name,
          content: readResult.content,
          headings: [],
          tags: [],
        },
        matches: ['content'],
        score,
      })
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  getBacklinksForFile(filePath: string): { fileName: string; path: string; context: string }[] {
    if (!this.ready) return []
    return fileIndexService.findBacklinks(filePath).map((file) => {
      const linkLine =
        file.content.split('\n').find((line) => line.includes('[[')) ||
        file.headings[0] ||
        file.content.split('\n').find((line) => line.trim()) ||
        ''
      return {
        fileName: file.name,
        path: file.path,
        context: linkLine.slice(0, 120),
      }
    })
  }

  getAllFiles(): { name: string; path: string }[] {
    if (!this.ready) return []
    return fileIndexService.getAllFiles().map((f) => ({ name: f.name, path: f.path }))
  }

  getTagIndex(): Map<string, { name: string; path: string }[]> {
    const map = new Map<string, { name: string; path: string }[]>()
    if (!this.ready) return map

    for (const file of fileIndexService.getAllFiles()) {
      for (const tag of file.tags) {
        const existing = map.get(tag) || []
        if (!existing.some((f) => f.path === file.path)) {
          existing.push({ name: file.name, path: file.path })
        }
        map.set(tag, existing)
      }
    }
    return map
  }

  /** Potential wikilinks + link debt for the editor sidebar. */
  analyzePotentialLinksForFile(filePath: string, content: string): {
    potential: PotentialLink[]
    debt: LinkDebtScore | null
  } {
    if (!this.ready) return { potential: [], debt: null }
    const files = fileIndexService.getAllFiles()
    const semanticHits = fileIndexService.getSemanticNeighbors(filePath, 10)
    return analyzePotentialLinks(filePath, content, files, semanticHits)
  }

  /** Top notes by link debt (for graph panel / review). */
  getLinkDebtRanking(limit = 15): LinkDebtScore[] {
    if (!this.ready) return []
    const files = fileIndexService.getAllFiles()
    const semanticMap = fileIndexService.buildSemanticNeighborMap(5)
    const backlinkCounts = new Map<string, number>()
    for (const file of files) {
      backlinkCounts.set(file.path, fileIndexService.countBacklinks(file.path))
    }
    return rankLinkDebt(files, semanticMap, backlinkCounts).slice(0, limit)
  }

  getNoteStemsForAutocomplete(): string[] {
    if (!this.ready) return []
    return fileIndexService.getAllFiles().map((f) => f.name.replace(/\.md$/i, ''))
  }
}

export const workspaceIndexService = new WorkspaceIndexService()
