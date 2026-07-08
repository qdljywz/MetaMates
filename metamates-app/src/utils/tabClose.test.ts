import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Modal } from 'antd'
import type { TFunction } from 'i18next'
import { confirmAllDirtyTabsClosed } from './tabClose'
import type { OpenTab } from '../store/appStore'

const tEditor = ((key: string) => key) as TFunction<'editor'>
const tCommon = ((key: string) => key) as TFunction<'common'>

describe('confirmAllDirtyTabsClosed', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(Modal, 'confirm').mockImplementation(() => ({
      destroy: vi.fn(),
      update: vi.fn(),
    }))
  })

  it('returns true when no tabs are dirty', async () => {
    const tabs: OpenTab[] = [{ path: 'a.md', name: 'a.md', isDirty: false }]
    await expect(confirmAllDirtyTabsClosed(tabs, tEditor, tCommon)).resolves.toBe(true)
    expect(Modal.confirm).not.toHaveBeenCalled()
  })

  it('returns true when user confirms discard', async () => {
    vi.mocked(Modal.confirm).mockImplementation((opts) => {
      opts.onOk?.()
      return { destroy: vi.fn(), update: vi.fn() }
    })
    const tabs: OpenTab[] = [{ path: 'a.md', name: 'a.md', isDirty: true }]
    await expect(confirmAllDirtyTabsClosed(tabs, tEditor, tCommon)).resolves.toBe(true)
    expect(Modal.confirm).toHaveBeenCalledOnce()
  })

  it('returns false when user cancels', async () => {
    vi.mocked(Modal.confirm).mockImplementation((opts) => {
      opts.onCancel?.()
      return { destroy: vi.fn(), update: vi.fn() }
    })
    const tabs: OpenTab[] = [{ path: 'a.md', name: 'a.md', isDirty: true }]
    await expect(confirmAllDirtyTabsClosed(tabs, tEditor, tCommon)).resolves.toBe(false)
  })
})
