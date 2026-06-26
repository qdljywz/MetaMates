import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  YOLO_ACK_STORAGE_KEY,
  acknowledgeYoloMode,
  clearYoloAcknowledgment,
  hasYoloAcknowledged,
} from './yoloAcknowledgment'

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: () => null,
    length: 0,
  })
}

describe('yoloAcknowledgment', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  it('starts unacknowledged', () => {
    expect(hasYoloAcknowledged()).toBe(false)
  })

  it('persists acknowledgment', () => {
    acknowledgeYoloMode()
    expect(hasYoloAcknowledged()).toBe(true)
    expect(localStorage.getItem(YOLO_ACK_STORAGE_KEY)).toBe('1')
  })

  it('can be cleared for tests', () => {
    acknowledgeYoloMode()
    clearYoloAcknowledgment()
    expect(hasYoloAcknowledged()).toBe(false)
  })
})
