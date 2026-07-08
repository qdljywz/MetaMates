/** Persisted consent for default YOLO (auto-approve) mode. */

export const YOLO_ACK_STORAGE_KEY = 'metamates-yolo-ack-v1'

export function isE2ESession(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as Window & { __METAMATES_E2E__?: { enabled?: boolean } }).__METAMATES_E2E__?.enabled,
  )
}

export function hasYoloAcknowledged(): boolean {
  try {
    return localStorage.getItem(YOLO_ACK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** E2E runs use isolated profiles — never block automation on first-run YOLO UI. */
export function shouldSkipYoloFirstRunPrompt(): boolean {
  return hasYoloAcknowledged() || isE2ESession()
}

export function acknowledgeYoloMode(): void {
  try {
    localStorage.setItem(YOLO_ACK_STORAGE_KEY, '1')
  } catch {
    // best-effort
  }
}

export function clearYoloAcknowledgment(): void {
  try {
    localStorage.removeItem(YOLO_ACK_STORAGE_KEY)
  } catch {
    // best-effort
  }
}
