import { describe, expect, it } from 'vitest'
import { speechLangFromI18n } from '../hooks/useSpeechRecognition'
import { mapNativeSpeechError, mergeVoiceTranscript } from '../utils/voiceTranscript'

describe('speechLangFromI18n', () => {
  it('maps zh UI language to zh-CN', () => {
    expect(speechLangFromI18n('zh')).toBe('zh-CN')
    expect(speechLangFromI18n('zh-CN')).toBe('zh-CN')
  })

  it('maps en to en-US', () => {
    expect(speechLangFromI18n('en')).toBe('en-US')
  })
})

describe('mergeVoiceTranscript', () => {
  it('appends final chunks and shows interim', () => {
    let acc = ''
    let row = mergeVoiceTranscript('prefix ', acc, { final: 'hello', interim: '' })
    acc = row.accumulatedFinal
    expect(row.display).toBe('prefix hello')

    row = mergeVoiceTranscript('prefix ', acc, { final: '', interim: ' world' })
    expect(row.display).toBe('prefix hello world')

    row = mergeVoiceTranscript('prefix ', acc, { final: ' world', interim: '' })
    expect(row.display).toBe('prefix hello world')
  })
})

describe('mapNativeSpeechError', () => {
  it('maps permission errors', () => {
    expect(mapNativeSpeechError('Access denied')).toBe('not-allowed')
  })

  it('falls back to native-failed', () => {
    expect(mapNativeSpeechError('windows-speech-exit-1')).toBe('native-failed')
  })
})
