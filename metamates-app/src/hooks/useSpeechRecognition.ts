/**
 * Browser / Electron speech input wrapper.
 * Default (auto): local Whisper first, then Windows System.Speech, then Web Speech.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  resolveSpeechBackend,
  type SpeechEnginePreference,
  type ResolvedSpeechBackend,
} from '../utils/resolveSpeechBackend'
import { mapNativeSpeechError, mapWhisperSpeechError } from '../utils/voiceTranscript'
import { blobToWhisperPcm } from '../utils/whisperAudio'
import { buildWhisperRecordingBlob, WHISPER_STREAM_INTERVAL_MS } from '../utils/whisperStream'

type SpeechRecognitionCtor = new () => SpeechRecognition
type SpeechBackend = 'pending' | ResolvedSpeechBackend

/** Errors where auto-restart makes things worse. */
const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'network',
  'audio-capture',
  'start-failed',
])

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function speechLangFromI18n(language: string): string {
  if (language.startsWith('zh')) return 'zh-CN'
  if (language.startsWith('ja')) return 'ja-JP'
  if (language.startsWith('ko')) return 'ko-KR'
  return 'en-US'
}

export function isElectronEnvironment(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { electronAPI?: unknown }).electronAPI
}

interface UseSpeechRecognitionOptions {
  language: string
  enginePreference?: SpeechEnginePreference
  onTranscript: (update: { final: string; interim: string }) => void
  onError?: (code: string) => void
}

export function useSpeechRecognition({
  language,
  enginePreference = 'auto',
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [speechBackend, setSpeechBackend] = useState<SpeechBackend>('pending')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const whisperMimeRef = useRef('audio/webm')
  const whisperStreamTimerRef = useRef<number | null>(null)
  const whisperLatestTextRef = useRef('')
  const listeningRef = useRef(false)
  const transcribingRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  const onErrorRef = useRef(onError)

  onTranscriptRef.current = onTranscript
  onErrorRef.current = onError

  const releaseMic = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const teardownWebRecognition = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    try {
      recognition.abort()
    } catch {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
    }
    recognitionRef.current = null
  }, [])

  const clearWhisperStreamTimer = useCallback(() => {
    if (whisperStreamTimerRef.current != null) {
      window.clearInterval(whisperStreamTimerRef.current)
      whisperStreamTimerRef.current = null
    }
  }, [])

  const stopWhisperRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
    }
    mediaRecorderRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      clearWhisperStreamTimer()
    }
  }, [clearWhisperStreamTimer])

  useEffect(() => {
    let cancelled = false

    const detectSupport = async () => {
      let whisperAvailable = false
      let nativeAvailable = false
      if (isElectronEnvironment()) {
        try {
          const status = await window.electronAPI?.speech?.isAvailable?.()
          whisperAvailable = status?.whisper === true
          nativeAvailable = status?.native === true || status?.available === true
        } catch {
          whisperAvailable = false
          nativeAvailable = false
        }
      }

      if (cancelled) return
      const webAvailable = !!getSpeechRecognitionCtor()
      const backend = resolveSpeechBackend(enginePreference, webAvailable, nativeAvailable, whisperAvailable)
      setSpeechBackend(backend)
      setIsSupported(backend !== 'none')
    }

    void detectSupport()

    const onPluginsChanged = () => {
      void detectSupport()
    }
    window.addEventListener('metamates:plugins-changed', onPluginsChanged)

    return () => {
      cancelled = true
      window.removeEventListener('metamates:plugins-changed', onPluginsChanged)
    }
  }, [enginePreference])

  useEffect(() => {
    if (speechBackend !== 'web') return undefined

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return undefined

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = speechLangFromI18n(language)

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? ''
        if (event.results[i].isFinal) {
          finalChunk += piece
        } else {
          interim += piece
        }
      }
      onTranscriptRef.current({ final: finalChunk, interim })
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') return
      if (FATAL_SPEECH_ERRORS.has(event.error)) {
        listeningRef.current = false
      }
      onErrorRef.current?.(event.error)
      setIsListening(false)
      releaseMic()
    }

    recognition.onend = () => {
      if (!listeningRef.current) {
        setIsListening(false)
        releaseMic()
        return
      }
      window.setTimeout(() => {
        if (!listeningRef.current || recognitionRef.current !== recognition) return
        try {
          recognition.start()
        } catch {
          listeningRef.current = false
          setIsListening(false)
          releaseMic()
          onErrorRef.current?.('start-failed')
        }
      }, 280)
    }

    recognitionRef.current = recognition

    return () => {
      listeningRef.current = false
      clearWhisperStreamTimer()
      teardownWebRecognition()
      releaseMic()
    }
  }, [speechBackend, language, releaseMic, teardownWebRecognition, clearWhisperStreamTimer])

  const transcribeWhisperBlob = useCallback(
    async (blob: Blob, mode: 'stream' | 'final') => {
      const api = window.electronAPI?.speech
      if (!api?.transcribeAudio) {
        if (mode === 'final') onErrorRef.current?.('start-failed')
        return
      }
      transcribingRef.current = true
      if (mode === 'stream' && listeningRef.current) {
        const hint = whisperLatestTextRef.current
        onTranscriptRef.current({ final: '', interim: hint ? `${hint}…` : '…' })
      }
      try {
        const pcmPayload = await blobToWhisperPcm(blob)
        const result = await api.transcribeAudio({
          pcmBase64: pcmPayload.pcmBase64,
          sampleRate: pcmPayload.sampleRate,
          language,
        })
        if (!result.success) {
          if (mode === 'final') {
            onErrorRef.current?.(mapWhisperSpeechError(result.error ?? 'whisper-failed'))
          }
          return
        }
        const text = result.text?.trim() ?? ''
        if (!text) {
          if (mode === 'final' && !whisperLatestTextRef.current) {
            onErrorRef.current?.('no-speech')
          }
          return
        }
        whisperLatestTextRef.current = text
        if (mode === 'final') {
          onTranscriptRef.current({ final: text, interim: '' })
          return
        }
        if (listeningRef.current) {
          onTranscriptRef.current({ final: '', interim: text })
        }
      } catch {
        if (mode === 'final') onErrorRef.current?.('start-failed')
      } finally {
        transcribingRef.current = false
      }
    },
    [language],
  )

  const runWhisperStreamPass = useCallback(
    async (mode: 'stream' | 'final') => {
      if (mode === 'stream' && transcribingRef.current) return
      const blob = buildWhisperRecordingBlob(audioChunksRef.current, whisperMimeRef.current)
      if (!blob) {
        if (mode === 'final' && !whisperLatestTextRef.current) {
          onErrorRef.current?.('no-speech')
        }
        return
      }
      await transcribeWhisperBlob(blob, mode)
    },
    [transcribeWhisperBlob],
  )

  const stopNative = useCallback(async () => {
    listeningRef.current = false
    setIsListening(false)
    await window.electronAPI?.speech?.stop?.()
  }, [])

  const startNative = useCallback(async () => {
    const api = window.electronAPI?.speech
    if (!api) return false

    const result = await api.start(speechLangFromI18n(language))
    if (!result.success) {
      onErrorRef.current?.(mapNativeSpeechError(result.error ?? 'native-failed'))
      return true
    }

    listeningRef.current = true
    setIsListening(true)
    return true
  }, [language])

  const stopWhisper = useCallback(() => {
    listeningRef.current = false
    setIsListening(false)
    clearWhisperStreamTimer()
    stopWhisperRecorder()
  }, [clearWhisperStreamTimer, stopWhisperRecorder])

  const startWhisper = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.('not-allowed')
      return
    }

    try {
      releaseMic()
      clearWhisperStreamTimer()
      audioChunksRef.current = []
      whisperLatestTextRef.current = ''
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
      whisperMimeRef.current = mimeType || 'audio/webm'

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        releaseMic()
        void runWhisperStreamPass('final')
      }
      recorder.onerror = () => {
        listeningRef.current = false
        setIsListening(false)
        clearWhisperStreamTimer()
        releaseMic()
        onErrorRef.current?.('audio-capture')
      }

      mediaRecorderRef.current = recorder
      recorder.start(250)
      listeningRef.current = true
      setIsListening(true)
      whisperStreamTimerRef.current = window.setInterval(() => {
        if (!listeningRef.current) return
        void runWhisperStreamPass('stream')
      }, WHISPER_STREAM_INTERVAL_MS)
    } catch {
      clearWhisperStreamTimer()
      releaseMic()
      onErrorRef.current?.('not-allowed')
    }
  }, [clearWhisperStreamTimer, releaseMic, runWhisperStreamPass])

  const stopWeb = useCallback(() => {
    listeningRef.current = false
    setIsListening(false)
    releaseMic()
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      try {
        recognition.abort()
      } catch {
        /* ignore */
      }
    }
  }, [releaseMic])

  const startWeb = useCallback(async () => {
    const recognition = recognitionRef.current
    if (!recognition) {
      onErrorRef.current?.('start-failed')
      return
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        releaseMic()
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        onErrorRef.current?.('not-allowed')
        return
      }
    }

    recognition.lang = speechLangFromI18n(language)
    listeningRef.current = true

    try {
      recognition.abort()
    } catch {
      /* ignore */
    }

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      listeningRef.current = false
      setIsListening(false)
      releaseMic()
      onErrorRef.current?.('start-failed')
    }
  }, [language, releaseMic])

  useEffect(() => {
    if (!isElectronEnvironment()) return undefined
    const api = window.electronAPI?.speech
    if (!api) return undefined

    const offTranscript = api.onTranscript?.((data) => {
      onTranscriptRef.current(data)
    })
    const offError = api.onError?.((data) => {
      if (speechBackend !== 'native' || !listeningRef.current) return
      listeningRef.current = false
      setIsListening(false)
      onErrorRef.current?.(mapNativeSpeechError(data.message ?? data.code))
    })

    return () => {
      offTranscript?.()
      offError?.()
      if (speechBackend === 'native') {
        void api.stop?.()
      }
    }
  }, [speechBackend])

  const stop = useCallback(() => {
    if (speechBackend === 'native') {
      void stopNative()
      return
    }
    if (speechBackend === 'whisper') {
      stopWhisper()
      return
    }
    stopWeb()
  }, [speechBackend, stopNative, stopWhisper, stopWeb])

  const start = useCallback(async () => {
    if (speechBackend === 'native') {
      await startNative()
      return
    }
    if (speechBackend === 'whisper') {
      await startWhisper()
      return
    }
    await startWeb()
  }, [speechBackend, startNative, startWhisper, startWeb])

  const toggle = useCallback(() => {
    if (isListening) {
      stop()
    } else {
      void start()
    }
  }, [isListening, start, stop])

  return { isListening, isSupported, start, stop, toggle }
}
