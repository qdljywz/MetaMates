import { describe, expect, it } from 'vitest'
import { speechLangFromI18n } from '../hooks/useSpeechRecognition'

describe('speechLangFromI18n', () => {
  it('maps zh/ja/ko prefixes to BCP-47 tags', () => {
    expect(speechLangFromI18n('zh')).toBe('zh-CN')
    expect(speechLangFromI18n('zh-TW')).toBe('zh-CN')
    expect(speechLangFromI18n('ja')).toBe('ja-JP')
    expect(speechLangFromI18n('ko-KR')).toBe('ko-KR')
    expect(speechLangFromI18n('en')).toBe('en-US')
  })
})
