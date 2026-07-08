import { Modal } from 'antd'
import type { TFunction } from 'i18next'
import type { OpenTab } from '../store/appStore'
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
): Promise<boolean> {
  const tab = tabs.find((item) => treePathsEqual(item.path, path))
  if (!tab?.isDirty) return true
  return confirmDiscardUnsavedTab(t, tCommon)
}

/** Before workspace switch / bulk close — block if user cancels unsaved confirm. */
export async function confirmAllDirtyTabsClosed(
  tabs: OpenTab[],
  t: TFunction<'editor'>,
  tCommon: TFunction<'common'>,
): Promise<boolean> {
  if (!tabs.some((tab) => tab.isDirty)) return true
  return confirmDiscardUnsavedTab(t, tCommon)
}
