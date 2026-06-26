/**
 * 从提取文本生成结构化摘要（本地启发式，无需 LLM）
 */

export interface ExtractedSummary {
  overview: string
  keyPoints: string[]
  dataSection: string
}

const SENTENCE_SPLIT = /(?<=[。！？.!?])\s+/

/**
 * @param text - 提取的纯文本
 */
export function summarizeExtractedText(text: string): ExtractedSummary {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return {
      overview: '未能从源文件提取到可读文本，请使用 Agent 附加原文件进行视觉/人工摘要。',
      keyPoints: [],
      dataSection: '',
    }
  }

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean)
  const keyPoints: string[] = []
  const dataLines: string[] = []

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      keyPoints.push(line.replace(/^#+\s*/, ''))
      continue
    }
    if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      keyPoints.push(line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''))
      continue
    }
    if (line.startsWith('|') && line.includes('|')) {
      dataLines.push(line)
    }
  }

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const contentParagraphs = paragraphs.filter((p) => !/^#{1,6}\s/.test(p))
  const firstParagraph = contentParagraphs[0] || paragraphs.find((p) => !/^#{1,6}\s/.test(p)) || normalized.slice(0, 500)
  const sentences = firstParagraph.split(SENTENCE_SPLIT).filter(Boolean)
  const overview = sentences.slice(0, 3).join(' ').slice(0, 600)

  const uniquePoints = [...new Set(keyPoints.map((p) => p.slice(0, 200)))].slice(0, 12)
  const dataSection = dataLines.length
    ? dataLines.slice(0, 25).join('\n')
    : ''

  return {
    overview: overview || normalized.slice(0, 400),
    keyPoints: uniquePoints,
    dataSection,
  }
}

/**
 * 截断用于「原文摘录」区块的内容
 * @param text - 完整提取文本
 * @param maxChars - 最大字符数
 */
export function truncateExcerpt(text: string, maxChars = 6000): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars)}\n\n…（摘录已截断，完整原件见 sources/）`
}

/**
 * 从文件名生成笔记标题
 * @param fileName - 源文件名
 */
export function titleFromSourceFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  return stem.replace(/[_-]+/g, ' ').trim() || '未命名情报'
}

/**
 * 生成情报笔记文件名
 * @param date - YYYY-MM-DD
 * @param title - 标题
 */
export function buildIntelligenceNoteFileName(date: string, title: string): string {
  const safe = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
  return `${date}_${safe || 'intel'}.md`
}
