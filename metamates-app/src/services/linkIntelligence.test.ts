import { describe, expect, it } from 'vitest'
import {
  analyzePotentialLinks,
  buildSemanticGraphLinks,
  computeLinkDebtForFile,
  containsPlainMention,
  findUnlinkedMentions,
  findSemanticPotentialLinks,
  getLinkedStems,
  buildPlainMentionCountMap,
  computeGraphNodeImportance,
  importanceToNodeSize,
  mergePotentialLinks,
  normalizeNoteStem,
  noteStemMatchesLink,
  rankLinkDebt,
  stripWikiLinksForMentionScan,
  resolveStemToNodeKey,
  wikiLinksToDualTrack,
} from './linkIntelligence'
import type { FileIndex } from './fileIndex'

function mockFile(name: string, content: string, links: string[] = []): FileIndex {
  return {
    name,
    path: `/vault/${name}`,
    content,
    wordCount: content.length,
    lastModified: Date.now(),
    links,
    tags: [],
    headings: [],
    tasks: [],
  }
}

describe('linkIntelligence', () => {
  it('normalizeNoteStem strips path and extension', () => {
    expect(normalizeNoteStem('Daily/2026.md')).toBe('Daily')
    expect(normalizeNoteStem('项目计划.md')).toBe('项目计划')
  })

  it('getLinkedStems parses wikilinks', () => {
    const stems = getLinkedStems('见 [[项目A]] 和 [[笔记B|别名]]')
    expect(stems.has('项目A')).toBe(true)
    expect(stems.has('笔记B')).toBe(true)
  })

  it('findUnlinkedMentions detects plain-text title mentions', () => {
    const catalog = [
      { name: '项目A.md', path: '/vault/项目A.md', stem: '项目A' },
      { name: '会议.md', path: '/vault/会议.md', stem: '会议' },
    ]
    const content = '今天讨论了项目A的进展，还写了 [[会议]] 的纪要。'
    const hits = findUnlinkedMentions('/vault/当前.md', content, catalog)
    expect(hits.some((h) => h.targetStem === '项目A')).toBe(true)
    expect(hits.some((h) => h.targetStem === '会议')).toBe(false)
  })

  it('does not count mentions inside existing wikilinks', () => {
    const text = stripWikiLinksForMentionScan('[[项目A]] only link')
    expect(containsPlainMention(text, '项目A')).toBe(false)
  })

  it('findSemanticPotentialLinks skips already linked notes', () => {
    const linked = getLinkedStems('[[已有链接]]')
    const hits = findSemanticPotentialLinks(
      '/vault/a.md',
      linked,
      [
        { file: mockFile('已有链接.md', ''), score: 9 },
        { file: mockFile('新邻居.md', ''), score: 8 },
      ],
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].targetStem).toBe('新邻居')
  })

  it('mergePotentialLinks dedupes by path', () => {
    const merged = mergePotentialLinks(
      [{ targetStem: 'A', targetPath: '/a', targetName: 'A.md', reason: 'unlinked_mention', score: 10 }],
      [{ targetStem: 'A', targetPath: '/a', targetName: 'A.md', reason: 'semantic', score: 5 }],
    )
    expect(merged).toHaveLength(1)
  })

  it('computeLinkDebtForFile scores orphans and unlinked mentions', () => {
    const catalog = [{ name: '目标.md', path: '/vault/目标.md', stem: '目标' }]
    const file = mockFile('孤立.md', '提到了目标但没有链接', [])
    const debt = computeLinkDebtForFile(file, catalog, [file, mockFile('目标.md', '')], [], 0)
    expect(debt.unlinkedMentions).toBe(1)
    expect(debt.isOrphan).toBe(true)
    expect(debt.score).toBeGreaterThan(0)
  })

  it('analyzePotentialLinks returns potential links and debt', () => {
    const files = [
      mockFile('当前.md', '关于项目Alpha的讨论'),
      mockFile('项目Alpha.md', 'alpha note'),
    ]
    const { potential, debt } = analyzePotentialLinks(
      '/vault/当前.md',
      '关于项目Alpha的讨论',
      files,
      [{ file: files[1], score: 12 }],
    )
    expect(potential.length).toBeGreaterThan(0)
    expect(debt?.path).toBe('/vault/当前.md')
  })

  it('resolveStemToNodeKey matches path-based node ids', () => {
    const map = new Map([['概览', '02_项目/智脉先锋/概览']])
    expect(resolveStemToNodeKey('概览', map, ['02_项目/智脉先锋/概览'])).toBe('02_项目/智脉先锋/概览')
    expect(resolveStemToNodeKey('missing', map, ['02_项目/智脉先锋/概览'])).toBeUndefined()
  })

  it('buildSemanticGraphLinks creates dashed-track edges', () => {
    const a = mockFile('a.md', 'content a')
    const b = mockFile('b.md', 'content b')
    const semanticMap = new Map([
      ['/vault/a.md', [{ file: b, score: 8 }]],
    ])
    const edges = buildSemanticGraphLinks([a, b], semanticMap, 2, 3)
    expect(edges.some((e) => e.kind === 'semantic' && e.source === 'a' && e.target === 'b')).toBe(true)
  })

  it('wikiLinksToDualTrack marks wiki kind', () => {
    const edges = wikiLinksToDualTrack([{ source: 'a', target: 'b' }])
    expect(edges[0].kind).toBe('wiki')
  })

  it('noteStemMatchesLink compares stems exactly', () => {
    expect(noteStemMatchesLink('项目A', '项目A.md')).toBe(true)
    expect(noteStemMatchesLink('项目A', '项目AB')).toBe(false)
  })

  it('rankLinkDebt sorts by score descending', () => {
    const low = mockFile('low.md', 'plain', ['x'])
    const high = mockFile('high.md', 'mentions 目标 without link')
    const catalog = [{ name: '目标.md', path: '/vault/目标.md', stem: '目标' }]
    const ranked = rankLinkDebt(
      [low, high],
      new Map([
        ['/vault/high.md', [{ file: mockFile('目标.md', ''), score: 10 }]],
        ['/vault/low.md', []],
      ]),
      new Map([
        ['/vault/low.md', 2],
        ['/vault/high.md', 0],
      ]),
    )
    expect(ranked[0].path).toBe('/vault/high.md')
  })

  it('computeGraphNodeImportance weights backlinks highest', () => {
    const hub = computeGraphNodeImportance({ inDegree: 5, outDegree: 1, mentionCount: 0 })
    const leaf = computeGraphNodeImportance({ inDegree: 0, outDegree: 5, mentionCount: 0 })
    expect(hub).toBeGreaterThan(leaf)
  })

  it('importanceToNodeSize grows with importance', () => {
    const small = importanceToNodeSize(0)
    const large = importanceToNodeSize(30)
    expect(large).toBeGreaterThan(small)
  })

  it('buildPlainMentionCountMap counts cross-note mentions', () => {
    const files = [
      mockFile('目标.md', 'target note'),
      mockFile('引用.md', '今天讨论了目标的内容'),
    ]
    const counts = buildPlainMentionCountMap(files)
    expect(counts.get('目标')).toBe(1)
  })
})
