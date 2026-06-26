import { describe, it, expect } from 'vitest'
import {
  summarizeExtractedText,
  buildIntelligenceNoteFileName,
  titleFromSourceFileName,
} from './intelligenceSummarize'
import { buildIntelligenceNoteContent } from './intelligenceImport'
import { isImportableDocument, getDocumentFormat } from '../../electron/shared/importableFormats'
import { titleFromUrl } from '../utils/intelligenceCapture'

describe('importableFormats', () => {
  it('应识别 PDF 与常见图片', () => {
    expect(getDocumentFormat('/a/report.PDF')).toBe('pdf')
    expect(getDocumentFormat('/a/photo.PNG')).toBe('image')
    expect(isImportableDocument('/a/chart.webp')).toBe(true)
  })

  it('不支持的扩展名应返回 null', () => {
    expect(getDocumentFormat('/a/app.exe')).toBeNull()
  })
})

describe('intelligenceSummarize', () => {
  it('应提取概述与要点', () => {
    const text = `# 行业报告\n\n市场增长迅速。下一季度需关注成本。\n\n- 要点 A\n- 要点 B`
    const summary = summarizeExtractedText(text)
    expect(summary.overview).toContain('市场')
    expect(summary.keyPoints.length).toBeGreaterThan(0)
  })

  it('titleFromSourceFileName 应清理扩展名', () => {
    expect(titleFromSourceFileName('2024_report.pdf')).toBe('2024 report')
  })

  it('buildIntelligenceNoteFileName 应生成日期前缀', () => {
    expect(buildIntelligenceNoteFileName('2026-06-22', '竞品分析')).toMatch(/^2026-06-22_/)
  })
})

describe('buildIntelligenceNoteContent', () => {
  it('应包含 frontmatter 与摘录', () => {
    const md = buildIntelligenceNoteContent({
      title: '测试报告',
      format: 'pdf',
      sourceRelativePath: '04_情报与连接/sources/report.pdf',
      importedAt: '2026-06-22T00:00:00.000Z',
      language: 'zh',
      extractedText: '第一段结论。\n\n- 要点一',
    })
    expect(md).toContain('type: intelligence')
    expect(md).toContain('## 核心结论')
    expect(md).toContain('要点一')
  })

  it('URL 来源应写入 source_url', () => {
    const md = buildIntelligenceNoteContent({
      title: '行业动态',
      format: 'url',
      sourceUrl: 'https://example.com/article',
      importedAt: '2026-06-22T00:00:00.000Z',
      language: 'zh',
      extractedText: '网页正文',
    })
    expect(md).toContain('source_url: https://example.com/article')
    expect(md).toContain('https://example.com/article')
  })
})
