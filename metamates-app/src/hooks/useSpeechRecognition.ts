/**
 * Browser / Electron speech input wrapper.
 * Windows Electron: native System.Speech via main process (offline).
 * Other environments: Web Speech API when available.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionCtor = new () => SpeechRecognition

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
  onTranscript: (update: { final: string; interim: string }) => void
  onError?: (code: string) => void
}

function mapNativeSpeechError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('access') || lower.includes('denied') || lower.includes('permission')) {
    return 'not-allowed'
  }
  if (lower.includes('network') || lower.includes('google')) {
    return 'network'
  }
  return 'native-failed'
}

export function useSpeechRecognition({
  language,
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const listeningRef = useRef(false)
  const nativeModeRef = useRef(false)
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

  useEffect(() => {
    let cancelled = false

    const detectSupport = async () => {
      const native = await window.electronAPI?.speech?.isAvailable?.()
      if (native?.available) {
        if (!cancelled) {
          nativeModeRef.current = true
          setIsSupported(true)
        }
        return
      }

      nativeModeRef.current = false
      if (!cancelled) setIsSupported(!!getSpeechRecognitionCtor())
    }

    void detectSupport()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (nativeModeRef.current) return undefined

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
      teardownWebRecognition()
      releaseMic()
    }
  }, [language, releaseMic, teardownWebRecognition])

  const stopNative = useCallback(async () => {
    listeningRef.current = false
    setIsListening(false)
    releaseMic()
    await window.electronAPI?.speech?.stop?.()
  }, [releaseMic])

  const startNative = useCallback(async () => {
    const api = window.electronAPI?.speech
    if (!api) return false

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        releaseMic()
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        onErrorRef.current?.('not-allowed')
        return true
      }
    }

    const result = await api.start(speechLangFromI18n(language))
    if (!result.success) {
      releaseMic()
      onErrorRef.current?.('native-failed')
      return true
    }

    listeningRef.current = true
    setIsListening(true)
    return true
  }, [language, releaseMic])

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
    if (!nativeModeRef.current) return undefined
    const api = window.electronAPI?.speech
    if (!api) return undefined

    const offTranscript = api.onTranscript?.((data) => {
      onTranscriptRef.current(data)
    })
    const offError = api.onError?.((data) => {
      listeningRef.current = false
      setIsListening(false)
      releaseMic()
      onErrorRef.current?.(mapNativeSpeechError(data.message ?? data.code))
    })

    return () => {
      offTranscript?.()
      offError?.()
      void api.stop?.()
    }
  }, [releaseMic])

  const stop = useCallback(() => {
    if (nativeModeRef.current) {
      void stopNative()
      return
    }
    stopWeb()
  }, [stopNative, stopWeb])

  const start = useCallback(async () => {
    if (nativeModeRef.current) {
      await startNative()
      return
    }
    await startWeb()
  }, [startNative, startWeb])

  const toggle = useCallback(() => {
    if (isListening) {
      stop()
    } else {
      void start()
    }
  }, [isListening, start, stop])

  return { isListening, isSupported, start, stop, toggle }
}
