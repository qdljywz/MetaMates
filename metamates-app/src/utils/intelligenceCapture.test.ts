import { describe, expect, it } from 'vitest'
import { parseIntelCaptureTarget, stripIntelCommandPrefix } from './intelligenceCapture'

describe('parseIntelCaptureTarget', () => {
  it('detects URL', () => {
    expect(parseIntelCaptureTarget('https://example.com/article')?.kind).toBe('url')
  })

  it('detects file path with extension', () => {
    expect(parseIntelCaptureTarget('notes/report.pdf')?.kind).toBe('file')
  })

  it('treats plain prose as text', () => {
    const target = parseIntelCaptureTarget('今天去了首都博物馆，买了冰箱贴。')
    expect(target?.kind).toBe('text')
    expect(target?.value).toContain('首都博物馆')
  })

  it('strips /intel prefix before parsing text', () => {
    const target = parseIntelCaptureTarget(stripIntelCommandPrefix('/intel 一段摘录内容'))
    expect(target?.kind).toBe('text')
  })
})
