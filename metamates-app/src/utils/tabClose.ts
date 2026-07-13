import { Modal } from 'antd'
import type { TFunction } from 'i18next'
import type { OpenTab } from '../store/appStore'
import { flushPendingAutoSave } from './autoSaveFlush'
import { treePathsEqual } from './fileTreeExpand'

export function confirmDiscardUnsavedTab(
  t: TFunction<'editor'>,
  tCommon: TFunction<'common'>,
): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: t('tabs.unsavedCloseTitle'),
      content: t('tabs.unsavedCloseBody'),
      okText: t('tabs.unsavedCloseConfirm'),
      cancelText: tCommon('actions.cancel'),
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

export async function maybeCloseTab(
  tabs: OpenTab[],
  path: string,
  t: TFunction<'editor'>,
  tCommon: TFunction<'common'>,
  options?: { autoSave?: boolean },
): Promise<boolean> {
  const tab = tabs.find((item) => treePathsEqual(item.path, path))
  if (!tab?.isDirty) return true

  // LOCKED: autoSave ON → flush debounced save, close silently (no unsaved prompt).
  if (options?.autoSave !== false) {
    const saved = await flushPendingAutoSave(path)
    if (saved) return true
  }

  return confirmDiscardUnsavedTab(t, tCommon)
}

/** Before workspace switch / bulk close — block if user cancels unsaved confirm. */
export async function confirmAllDirtyTabsClosed(
  tabs: OpenTab[],
  t: TFunction<'editor'>,
  tCommon: TFunction<'common'>,
  options?: { autoSave?: boolean; currentFile?: string | null },
): Promise<boolean> {
  if (!tabs.some((tab) => tab.isDirty)) return true

  if (options?.autoSave !== false && options?.currentFile) {
    const currentDirty = tabs.some(
      (tab) => tab.isDirty && treePathsEqual(tab.path, options.currentFile!),
    )
    if (currentDirty) {
      const saved = await flushPendingAutoSave(options.currentFile!)
      if (saved) {
        const othersDirty = tabs.some(
          (tab) => tab.isDirty && !treePathsEqual(tab.path, options.currentFile!),
        )
        if (!othersDirty) return true
      }
    }
  }

  return confirmDiscardUnsavedTab(t, tCommon)
}
