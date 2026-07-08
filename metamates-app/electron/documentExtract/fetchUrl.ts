import * as dns from 'dns'
import * as net from 'net'
import { URL } from 'url'
import { extractHtmlTitle, stripHtmlToText } from './htmlText'

export interface UrlFetchResult {
  success: boolean
  url?: string
  finalUrl?: string
  title?: string
  text?: string
  contentType?: string
  warnings?: string[]
  error?: string
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_TEXT_CHARS = 120_000
const FETCH_TIMEOUT_MS = 25_000

/**
 * 判断是否为内网 / 本地 IP
 * @param ip - IP 地址
 */
function isPrivateOrLocalIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return true
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  return false
}

/**
 * SSRF 防护：仅允许公网 http(s)
 * @param rawUrl - 用户输入 URL
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('Invalid URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported')
  }

  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0'
  ) {
    throw new Error('Blocked hostname')
  }

  if (net.isIP(host)) {
    if (isPrivateOrLocalIp(host)) {
      throw new Error('Blocked private network address')
    }
    return parsed
  }

  const addresses = await dns.promises.lookup(host, { all: true, verbatim: true })
  if (addresses.length === 0) {
    throw new Error('Could not resolve hostname')
  }
  for (const entry of addresses) {
    if (isPrivateOrLocalIp(entry.address)) {
      throw new Error('Blocked private network address')
    }
  }

  return parsed
}

/**
 * 抓取网页并提取正文
 * @param rawUrl - 用户输入 URL
 */
export async function fetchUrlContent(rawUrl: string): Promise<UrlFetchResult> {
  const warnings: string[] = []

  try {
    const parsed = await assertPublicHttpUrl(rawUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'MetaMates/0.1 IntelligenceBot (+https://github.com/qdljywz/MetaMates)',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
      },
    })
    clearTimeout(timer)

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} ${response.statusText}` }
    }

    const contentType = response.headers.get('content-type') || ''
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_RESPONSE_BYTES) {
      warnings.push(`响应体较大（${buffer.length} bytes），已截断`)
    }
    const clipped = buffer.subarray(0, MAX_RESPONSE_BYTES)
    const body = clipped.toString('utf-8')

    let text = ''
    let title: string | undefined

    if (contentType.includes('text/html') || body.trimStart().startsWith('<!')) {
      title = extractHtmlTitle(body) || undefined
      text = stripHtmlToText(body)
    } else if (contentType.includes('application/json')) {
      try {
        text = JSON.stringify(JSON.parse(body), null, 2)
      } catch {
        text = body
        warnings.push('JSON 解析失败，已按纯文本处理')
      }
    } else {
      text = body
    }

    if (!text.trim()) {
      return {
        success: false,
        error: 'No readable text extracted from URL',
        url: parsed.toString(),
        finalUrl: response.url,
        contentType,
      }
    }

    if (text.length > MAX_TEXT_CHARS) {
      text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n…（网页正文已截断）`
      warnings.push(`正文超过 ${MAX_TEXT_CHARS} 字符，已截断`)
    }

    return {
      success: true,
      url: parsed.toString(),
      finalUrl: response.url,
      title,
      text,
      contentType,
      warnings: warnings.length ? warnings : undefined,
    }
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Request timed out' : (error?.message || String(error))
    return { success: false, error: message }
  }
}
