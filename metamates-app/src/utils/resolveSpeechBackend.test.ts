import { describe, expect, it } from 'vitest'
import { resolveSpeechBackend } from './resolveSpeechBackend'

describe('resolveSpeechBackend', () => {
  it('auto prefers whisper when available', () => {
    expect(resolveSpeechBackend('auto', true, true, true)).toBe('whisper')
  })

  it('auto falls back to native when whisper unavailable', () => {
    expect(resolveSpeechBackend('auto', true, true, false)).toBe('native')
  })

  it('auto falls back to web when only web is available', () => {
    expect(resolveSpeechBackend('auto', true, false, false)).toBe('web')
  })

  it('whisper preference returns none when plugin unavailable', () => {
    expect(resolveSpeechBackend('whisper', true, true, false)).toBe('none')
  })

  it('web preference still allows whisper fallback before native', () => {
    expect(resolveSpeechBackend('web', false, true, true)).toBe('whisper')
  })

  it('returns none when nothing is available', () => {
    expect(resolveSpeechBackend('auto', false, false, false)).toBe('none')
  })
})
