/**
 * AionUi-style turn lifecycle: start → work → finish/error.
 * Drives isStreaming from stream control messages, not raw ACP events.
 */

import { useCallback, useRef } from 'react'
import type { IResponseMessage } from '../../electron/shared/responseMessage'
import { isStreamingTurnActive, isTurnTerminalMessage } from '../services/message/acpStreamReducer'

export interface UseAcpStreamStateOptions {
  onTurnStart?: () => void
  onTurnEnd?: (message: IResponseMessage) => void
  setStreaming: (active: boolean) => void
}

export function useAcpStreamState(options: UseAcpStreamStateOptions) {
  const turnFinishedRef = useRef(false)
  const { onTurnStart, onTurnEnd, setStreaming } = options

  const handleControlMessage = useCallback((message: IResponseMessage, backend: string, activeBackend: string) => {
    if (backend !== activeBackend) return

    if (isStreamingTurnActive(message.type)) {
      turnFinishedRef.current = false
      setStreaming(true)
      onTurnStart?.()
      return
    }

    if (isTurnTerminalMessage(message.type)) {
      turnFinishedRef.current = true
      setStreaming(false)
      onTurnEnd?.(message)
    }
  }, [onTurnStart, onTurnEnd, setStreaming])

  const resetTurnState = useCallback(() => {
    turnFinishedRef.current = false
    setStreaming(false)
  }, [setStreaming])

  return {
    turnFinishedRef,
    handleControlMessage,
    resetTurnState,
  }
}
