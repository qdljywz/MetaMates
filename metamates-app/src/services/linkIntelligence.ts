/**
 * Link intelligence: unlinked mentions, semantic potential links, link debt, dual-track graph edges.
 */

import { LinkParser } from './linkParser'
import type { FileIndex } from './fileIndex'

/** Catalog entry for a vault note. */
export interface NoteCatalogEntry {
  name: string
  path: string
  /** Filename without `.md`. */
  stem: string
}

/** A suggested link the user has not created yet. */
export interface PotentialLink {
  targetStem: string
  targetPath: string
  targetName: string
  reason: 'unlinked_mention' | 'semantic'
  score: number
  context?: string
}

/** Per-note link maintenance score (higher = more "debt"). */
export interface LinkDebtScore {
  path: string
  name: string
  stem: string
  score: number
  unlinkedMentions: number
  semanticNeighborsWithoutLink: number
  isOrphan: boolean
}

/** Graph edge with explicit vs semantic kind. */
export interface DualTrackGraphLink {
  source: string
  target: string
  kind: 'wiki' | 'semantic'
  weight?: number
}

const WIKILINK_STRIP_RE = /\[\[[^\]]+\]\]/g

/**
 * Normalize a note filename or link target to a comparable stem.
 */
export function normalizeNoteStem(name: string): string {
  const base = name.split(/[/\\|#]/)[0].trim()
  return base.replace(/\.md$/i, '')
}

/** Whether a wikilink target refers to the given note stem. */
export function noteStemMatchesLink(linkTarget: string, stem: string): boolean {
  return normalizeNoteStem(linkTarget) === normalizeNoteStem(stem)
}

/**
 * Stems already linked via `[[wikilink]]` in content.
 */
export function getLinkedStems(content: string): Set<string> {
  const { links } = LinkParser.parse(content)
  const stems = new Set<string>()
  for (const link of links) {
    stems.add(normalizeNoteStem(link.target))
  }
  return stems
}

/**
 * Strip wikilink regions so mention detection ignores linked text.
 */
export function stripWikiLinksForMentionScan(content: string): string {
  return content.replace(WIKILINK_STRIP_RE, ' ')
}

/**
 * Whether plain text mentions a note title (not inside an existing wikilink).
 */
export function containsPlainMention(text: string, stem: string): boolean {
  if (!stem.trim()) return false
  const lowerText = text.toLowerCase()
  const lowerStem = stem.toLowerCase()

  if (/^[a-z0-9][a-z0-9 _-]*$/i.test(stem)) {
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i')
    return re.test(text)
  }

  return lowerText.includes(lowerStem)
}

/**
 * Extract a short line context around the first mention.
 */
export function extractMentionContext(text: string, stem: string, maxLen = 100): string {
  const idx = text.toLowerCase().indexOf(stem.toLowerCase())
  if (idx < 0) return ''
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + stem.length + 30)
  let snippet = text.slice(start, end).trim()
  if (start > 0) snippet = `…${snippet}`
  if (end < text.length) snippet = `${snippet}…`
  return snippet.slice(0, maxLen)
}

/**
 * Build note catalog from indexed files.
 */
export function buildNoteCatalog(files: FileIndex[]): NoteCatalogEntry[] {
  return files.map((file) => ({
    name: file.name,
    path: file.path,
    stem: normalizeNoteStem(file.name),
  }))
}

/**
 * Find note titles mentioned in prose but not linked with `[[…]]`.
 */
export function findUnlinkedMentions(
  currentPath: string,
  content: string,
  catalog: NoteCatalogEntry[],
): PotentialLink[] {
  const linked = getLinkedStems(content)
  const scanText = stripWikiLinksForMentionScan(content)
  const results: PotentialLink[] = []

  for (const entry of catalog) {
    if (entry.path === currentPath) continue
    if (linked.has(entry.stem)) continue
    if (!containsPlainMention(scanText, entry.stem)) continue

    results.push({
      targetStem: entry.stem,
      targetPath: entry.path,
      targetName: entry.name,
      reason: 'unlinked_mention',
      score: 10 + Math.min(entry.stem.length, 20),
      context: extractMentionContext(scanText, entry.stem),
    })
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * Semantic neighbors that are not already explicitly linked.
 */
export function findSemanticPotentialLinks(
  currentPath: string,
  linkedStems: Set<string>,
  semanticHits: Array<{ file: FileIndex; score: number }>,
  limit = 8,
): PotentialLink[] {
  const results: PotentialLink[] = []

  for (const hit of semanticHits) {
    if (hit.file.path === currentPath) continue
    const stem = normalizeNoteStem(hit.file.name)
    if (linkedStems.has(stem)) continue

    results.push({
      targetStem: stem,
      targetPath: hit.file.path,
      targetName: hit.file.name,
      reason: 'semantic',
      score: Math.round(hit.score * 10) / 10,
      context: hit.file.headings[0] || hit.file.content.split('\n').find((l) => l.trim())?.slice(0, 80),
    })
    if (results.length >= limit) break
  }

  return results
}

/**
 * Merge unlinked + semantic suggestions, dedupe by target path.
 */
export function mergePotentialLinks(
  unlinked: PotentialLink[],
  semantic: PotentialLink[],
  limit = 12,
): PotentialLink[] {
  const seen = new Set<string>()
  const merged: PotentialLink[] = []

  for (const item of [...unlinked, ...semantic]) {
    if (seen.has(item.targetPath)) continue
    seen.add(item.targetPath)
    merged.push(item)
    if (merged.length >= limit) break
  }

  return merged
}

/**
 * Compute link debt for one note.
 */
export function computeLinkDebtForFile(
  file: FileIndex,
  catalog: NoteCatalogEntry[],
  allFiles: FileIndex[],
  semanticHits: Array<{ file: FileIndex; score: number }>,
  backlinkCount: number,
): LinkDebtScore {
  const linked = getLinkedStems(file.content)
  const unlinked = findUnlinkedMentions(file.path, file.content, catalog)
  const semantic = findSemanticPotentialLinks(file.path, linked, semanticHits, 20)

  const hasOutgoing = file.links.length > 0
  const isOrphan = !hasOutgoing && backlinkCount === 0 && allFiles.length > 1

  const score =
    unlinked.length * 3 +
    semantic.length * 2 +
    (isOrphan ? 5 : 0)

  return {
    path: file.path,
    name: file.name,
    stem: normalizeNoteStem(file.name),
    score,
    unlinkedMentions: unlinked.length,
    semanticNeighborsWithoutLink: semantic.length,
    isOrphan,
  }
}

/**
 * Rank all notes by link debt (highest first).
 */
export function rankLinkDebt(
  files: FileIndex[],
  semanticQueryByPath: Map<string, Array<{ file: FileIndex; score: number }>>,
  backlinkCounts: Map<string, number>,
): LinkDebtScore[] {
  const catalog = buildNoteCatalog(files)
  return files
    .map((file) =>
      computeLinkDebtForFile(
        file,
        catalog,
        files,
        semanticQueryByPath.get(file.path) || [],
        backlinkCounts.get(file.path) || 0,
      ),
    )
    .sort((a, b) => b.score - a.score)
}

/**
 * Resolve a note stem to a graph node key (path-based id).
 */
export function resolveStemToNodeKey(
  stem: string,
  stemToNodeKey: Map<string, string>,
  nodeKeys?: Iterable<string>,
): string | undefined {
  const normalized = normalizeNoteStem(stem)
  const direct = stemToNodeKey.get(normalized) ?? stemToNodeKey.get(stem)
  if (direct) return direct
  if (!nodeKeys) return undefined
  for (const nodeKey of nodeKeys) {
    const leaf = nodeKey.split('/').pop() || nodeKey
    if (normalizeNoteStem(leaf) === normalized) return nodeKey
  }
  return undefined
}

/**
 * Build semantic graph edges (top neighbors per note, excluding existing wikilinks).
 * Scores come from TF-IDF cosine × 100 (see fileIndex.searchSemantic).
 */
export function buildSemanticGraphLinks(
  files: FileIndex[],
  semanticQueryByPath: Map<string, Array<{ file: FileIndex; score: number }>>,
  neighborsPerNode = 2,
  minScore = 3,
): DualTrackGraphLink[] {
  const edges: DualTrackGraphLink[] = []
  const edgeKeys = new Set<string>()

  for (const file of files) {
    const sourceStem = normalizeNoteStem(file.name)
    const linked = getLinkedStems(file.content)
    const hits = semanticQueryByPath.get(file.path) || []
    let added = 0

    for (const hit of hits) {
      if (added >= neighborsPerNode) break
      const targetStem = normalizeNoteStem(hit.file.name)
      if (targetStem === sourceStem) continue
      if (linked.has(targetStem)) continue
      if (hit.score < minScore) continue

      const key = [sourceStem, targetStem].sort().join('→')
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)

      edges.push({
        source: sourceStem,
        target: targetStem,
        kind: 'semantic',
        weight: hit.score,
      })
      added += 1
    }
  }

  return edges
}

/**
 * Convert explicit wikilink pairs to dual-track wiki edges.
 */
export function wikiLinksToDualTrack(
  wikiLinks: Array<{ source: string; target: string }>,
): DualTrackGraphLink[] {
  return wikiLinks.map((link) => ({
    source: link.source,
    target: link.target,
    kind: 'wiki' as const,
  }))
}

/**
 * Full potential-link analysis for the editor sidebar.
 */
export function analyzePotentialLinks(
  currentPath: string,
  content: string,
  files: FileIndex[],
  semanticHits: Array<{ file: FileIndex; score: number }>,
): { potential: PotentialLink[]; debt: LinkDebtScore | null } {
  if (!currentPath || files.length === 0) {
    return { potential: [], debt: null }
  }

  const catalog = buildNoteCatalog(files)
  const unlinked = findUnlinkedMentions(currentPath, content, catalog)
  const linked = getLinkedStems(content)
  const semantic = findSemanticPotentialLinks(currentPath, linked, semanticHits)
  const potential = mergePotentialLinks(unlinked, semantic)

  const file = files.find((f) => f.path === currentPath)
  if (!file) return { potential, debt: null }

  const backlinkCount = files.filter(
    (f) => f.path !== currentPath && f.links.some((l) => noteStemMatchesLink(l, file.name)),
  ).length

  const debt = computeLinkDebtForFile(file, catalog, files, semanticHits, backlinkCount)
  return { potential, debt }
}

/** Inputs for graph node importance (size) scoring. */
export interface GraphNodeMetricsInput {
  inDegree: number
  outDegree: number
  mentionCount: number
}

/**
 * Combined importance: backlinks weigh most, then plain mentions, then outgoing links.
 */
export function computeGraphNodeImportance(metrics: GraphNodeMetricsInput): number {
  const { inDegree, outDegree, mentionCount } = metrics
  return inDegree * 3 + mentionCount * 2 + outDegree * 1.5
}

/**
 * Map importance score to visual node radius (log-scaled for large vaults).
 */
export function importanceToNodeSize(importance: number, min = 14, max = 52): number {
  if (importance <= 0) return min
  const scaled = min + Math.log1p(importance) * 8
  return Math.min(max, Math.max(min, scaled))
}

/**
 * Count how many notes mention each title in plain text (excluding wikilinks).
 */
export function buildPlainMentionCountMap(files: FileIndex[]): Map<string, number> {
  const catalog = buildNoteCatalog(files)
  const counts = new Map<string, number>()
  for (const entry of catalog) {
    counts.set(entry.stem, 0)
  }
  for (const file of files) {
    const scanText = stripWikiLinksForMentionScan(file.content)
    for (const entry of catalog) {
      if (entry.path === file.path) continue
      if (containsPlainMention(scanText, entry.stem)) {
        counts.set(entry.stem, (counts.get(entry.stem) || 0) + 1)
      }
    }
  }
  return counts
}
