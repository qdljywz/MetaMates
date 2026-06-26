/** Persisted consent for default YOLO (auto-approve) mode. */

export const YOLO_ACK_STORAGE_KEY = 'metamates-yolo-ack-v1'

export function hasYoloAcknowledged(): boolean {
  try {
    return localStorage.getItem(YOLO_ACK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
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
