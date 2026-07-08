/**
 * 从用户输入识别 URL 与情报抓取意图
 */

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi

const INTEL_KEYWORDS = /(?:总结|抓取|情报|收藏|保存|摘录|分析|capture|intel|summarize|save)/i

/**
 * @param text - 用户输入
 */
export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) || []
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?)]+$/, '')))]
}

/**
 * 去掉 /intel 前缀后的有效输入
 * @param text - 用户输入
 */
export function stripIntelCommandPrefix(text: string): string {
  return text.replace(/^\s*\/intel\b\s*/i, '').trim()
}

/**
 * 是否应走情报抓取流程
 * @param text - 用户输入
 * @param activeCommandId - 当前 slash 命令
 */
export function shouldCaptureAsIntelligence(text: string, activeCommandId?: string | null): boolean {
  if (activeCommandId === '/intel') return true
  const trimmed = text.trim()
  if (!trimmed) return false
  const urls = extractUrlsFromText(trimmed)
  if (urls.length === 0) return false
  if (/^\s*\/intel\b/i.test(trimmed)) return true
  if (urls.length === 1 && trimmed === urls[0]) return true
  if (INTEL_KEYWORDS.test(trimmed)) return true
  return false
}

/**
 * 解析 /intel 输入：URL、工作区文件路径，或纯文本摘录
 * @param text - 去掉命令前缀后的文本
 */
export function parseIntelCaptureTarget(
  text: string,
): { kind: 'url' | 'file' | 'text'; value: string } | null {
  const trimmed = stripIntelCommandPrefix(text).trim()
  if (!trimmed) return null

  const urls = extractUrlsFromText(trimmed)
  if (urls.length > 0) {
    return { kind: 'url', value: urls[0] }
  }

  const fileCandidate = trimmed.split(/\s+/)[0]
  if (looksLikeFilePath(fileCandidate)) {
    return { kind: 'file', value: fileCandidate }
  }

  return { kind: 'text', value: trimmed }
}

/** 是否像文件路径（含扩展名或路径分隔符），避免把普通句子误判为路径 */
function looksLikeFilePath(candidate: string): boolean {
  if (!candidate || /\s/.test(candidate)) return false
  if (/^https?:\/\//i.test(candidate)) return false
  if (/[\\/]/.test(candidate)) return true
  return /\.(pdf|docx?|xlsx?|csv|txt|md|markdown|html?|json|png|jpe?g|gif|webp|bmp)$/i.test(candidate)
}

/**
 * 从 URL 生成笔记标题
 * @param url - 网页链接
 * @param pageTitle - 页面标题（可选）
 */
export function titleFromUrl(url: string, pageTitle?: string): string {
  if (pageTitle?.trim()) {
    return pageTitle.trim().slice(0, 120)
  }
  try {
    const parsed = new URL(url)
    const pathPart = parsed.pathname.split('/').filter(Boolean).pop()
    if (pathPart) return decodeURIComponent(pathPart).replace(/[-_]+/g, ' ').slice(0, 80)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return '网页情报'
  }
}
