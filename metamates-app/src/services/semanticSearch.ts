/**
 * 轻量级 TF-IDF 语义搜索（离线、无 embedding 依赖）
 */

export interface SemanticDocument {
  id: string
  text: string
}

export interface SemanticSearchResult {
  id: string
  score: number
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
])

/**
 * 分词：英文按单词，中文按连续汉字序列（2字以上）及单字
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []

  const englishParts = lower.match(/[a-z0-9_]+/g) || []
  for (const part of englishParts) {
    if (part.length >= 2 && !STOP_WORDS.has(part)) {
      tokens.push(part)
    }
  }

  const chineseParts = lower.match(/[\u4e00-\u9fff]+/g) || []
  for (const part of chineseParts) {
    if (part.length >= 2) {
      tokens.push(part)
      for (let i = 0; i < part.length - 1; i++) {
        tokens.push(part.slice(i, i + 2))
      }
    } else if (part.length === 1) {
      tokens.push(part)
    }
  }

  return tokens
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1)
  }
  const maxFreq = Math.max(...tf.values(), 1)
  for (const [term, freq] of tf) {
    tf.set(term, 0.5 + 0.5 * (freq / maxFreq))
  }
  return tf
}

function vectorNorm(vec: Map<string, number>): number {
  let sum = 0
  for (const v of vec.values()) {
    sum += v * v
  }
  return Math.sqrt(sum) || 1
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  for (const [term, weightA] of a) {
    const weightB = b.get(term)
    if (weightB) dot += weightA * weightB
  }
  return dot / (vectorNorm(a) * vectorNorm(b))
}

export class SemanticSearchEngine {
  private documentVectors = new Map<string, Map<string, number>>()
  private idf = new Map<string, number>()
  private docCount = 0

  clear(): void {
    this.documentVectors.clear()
    this.idf.clear()
    this.docCount = 0
  }

  build(documents: SemanticDocument[]): void {
    this.clear()
    if (documents.length === 0) return

    this.docCount = documents.length
    const docTermSets: Map<string, Set<string>> = new Map()
    const docTokens: Map<string, string[]> = new Map()

    for (const doc of documents) {
      const tokens = tokenize(doc.text)
      docTokens.set(doc.id, tokens)
      docTermSets.set(doc.id, new Set(tokens))
    }

    const docFreq = new Map<string, number>()
    for (const terms of docTermSets.values()) {
      for (const term of terms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1)
      }
    }

    for (const [term, df] of docFreq) {
      this.idf.set(term, Math.log((1 + this.docCount) / (1 + df)) + 1)
    }

    for (const doc of documents) {
      const tokens = docTokens.get(doc.id) || []
      const tf = termFrequency(tokens)
      const vector = new Map<string, number>()
      for (const [term, tfVal] of tf) {
        vector.set(term, tfVal * (this.idf.get(term) || 1))
      }
      this.documentVectors.set(doc.id, vector)
    }
  }

  remove(id: string): void {
    if (this.documentVectors.delete(id)) {
      this.docCount = this.documentVectors.size
    }
  }

  search(query: string, limit = 20, minScore = 0.05): SemanticSearchResult[] {
    if (this.documentVectors.size === 0) return []

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const queryTf = termFrequency(queryTokens)
    const queryVector = new Map<string, number>()
    for (const [term, tfVal] of queryTf) {
      queryVector.set(term, tfVal * (this.idf.get(term) || 1))
    }

    const results: SemanticSearchResult[] = []
    for (const [id, docVector] of this.documentVectors) {
      const score = cosineSimilarity(queryVector, docVector)
      if (score >= minScore) {
        results.push({ id, score })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  getDocumentCount(): number {
    return this.documentVectors.size
  }
}

export const semanticSearchEngine = new SemanticSearchEngine()
