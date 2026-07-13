import React from 'react'
import { Button, message } from 'antd'
import type { TFunction } from 'i18next'
import type { PluginInstallFocusId } from './pluginInstallPrompt'

export function openPluginInstallToast(t: TFunction, pluginId: PluginInstallFocusId): void {
  const bodyKey =
    pluginId === 'document-import'
      ? 'pluginDocumentImportRequired'
      : 'pluginOfflineSpeechRequired'

  message.open({
    type: 'warning',
    duration: 6,
    content: (
      <span>
        {t(`common:settings.${bodyKey}`)}
        <Button
          type="link"
          size="small"
          style={{ paddingInline: 6 }}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('metamates:open-settings', {
                detail: { tab: 'agent', focusPluginId: pluginId },
              }),
            )
          }}
        >
          {t('sidebar:contextMenu.goToExtensions')}
        </Button>
      </span>
    ),
  })
}
