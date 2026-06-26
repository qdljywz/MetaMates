import { fetchUrlContent } from './fetchUrl'

export interface UrlIntelligencePrepareResult {
  success: boolean
  error?: string
  format?: 'url'
  sourceUrl?: string
  finalUrl?: string
  title?: string
  text?: string
  warnings?: string[]
}

/**
 * 抓取 URL 供情报笔记入库
 * @param rawUrl - 网页链接
 */
export async function prepareUrlIntelligenceImport(rawUrl: string): Promise<UrlIntelligencePrepareResult> {
  const fetched = await fetchUrlContent(rawUrl)
  if (!fetched.success || !fetched.text) {
    return { success: false, error: fetched.error || 'Failed to fetch URL' }
  }

  return {
    success: true,
    format: 'url',
    sourceUrl: fetched.url,
    finalUrl: fetched.finalUrl,
    title: fetched.title,
    text: fetched.text,
    warnings: fetched.warnings,
  }
}
