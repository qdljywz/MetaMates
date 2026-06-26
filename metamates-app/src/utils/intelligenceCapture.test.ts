import { describe, it, expect } from 'vitest'
import {
  extractUrlsFromText,
  shouldCaptureAsIntelligence,
  parseIntelCaptureTarget,
  titleFromUrl,
} from './intelligenceCapture'

describe('intelligenceCapture', () => {
  it('应提取文本中的 URL', () => {
    expect(extractUrlsFromText('请看 https://example.com/a 和 http://b.com')).toEqual([
      'https://example.com/a',
      'http://b.com',
    ])
  })

  it('纯链接或 /intel 应触发抓取', () => {
    expect(shouldCaptureAsIntelligence('https://news.example.com/x')).toBe(true)
    expect(shouldCaptureAsIntelligence('/intel https://a.com')).toBe(true)
    expect(shouldCaptureAsIntelligence('帮我总结 https://a.com', '/intel')).toBe(true)
    expect(shouldCaptureAsIntelligence('普通聊天没有链接')).toBe(false)
  })

  it('parseIntelCaptureTarget 应区分 URL 与文件', () => {
    expect(parseIntelCaptureTarget('https://a.com/page')).toEqual({ kind: 'url', value: 'https://a.com/page' })
    expect(parseIntelCaptureTarget('report.pdf')).toEqual({ kind: 'file', value: 'report.pdf' })
  })

  it('titleFromUrl 应优先页面标题', () => {
    expect(titleFromUrl('https://x.com/y', '行业周报')).toBe('行业周报')
  })
})
