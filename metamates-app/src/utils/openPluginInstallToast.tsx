import React from 'react'
import { Button, Space, message } from 'antd'
import type { TFunction } from 'i18next'
import type { PluginInstallFocusId } from './pluginInstallPrompt'

function mapPluginInstallError(error: string | undefined, t: TFunction): string {
  if (!error) return t('common:settings.pluginInstallErrorGeneric')
  const lower = error.toLowerCase()
  if (lower.includes('404') || lower.includes('not found')) {
    return t('common:settings.pluginInstallError404')
  }
  if (lower.includes('download failed') || lower.includes('network') || lower.includes('econn')) {
    return t('common:settings.pluginInstallErrorNetwork')
  }
  return error
}

async function installPluginOnDemand(pluginId: PluginInstallFocusId): Promise<{ success: boolean; error?: string }> {
  if (pluginId === 'document-import') {
    if (!window.electronAPI?.plugins?.installDocumentImport) {
      return { success: false, error: 'plugins API unavailable' }
    }
    return window.electronAPI.plugins.installDocumentImport()
  }
  if (!window.electronAPI?.plugins?.installOfflineSpeech) {
    return { success: false, error: 'plugins API unavailable' }
  }
  return window.electronAPI.plugins.installOfflineSpeech()
}

/** Toast when a feature needs an optional extension — Install now (local zip) or open Settings. */
export function openPluginInstallToast(t: TFunction, pluginId: PluginInstallFocusId): void {
  const bodyKey =
    pluginId === 'document-import'
      ? 'pluginDocumentImportRequired'
      : 'pluginOfflineSpeechRequired'

  message.open({
    type: 'warning',
    duration: 10,
    content: (
      <span>
        {t(`common:settings.${bodyKey}`)}
        <Space size={4} style={{ marginLeft: 8 }}>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 4 }}
            data-testid={`plugin-install-now-${pluginId}`}
            onClick={() => {
              void (async () => {
                const hide = message.loading(t('common:settings.pluginInstalling'), 0)
                try {
                  const result = await installPluginOnDemand(pluginId)
                  hide()
                  if (result.success) {
                    message.success(t('common:settings.pluginInstallSuccess'))
                    window.dispatchEvent(new CustomEvent('metamates:plugins-changed'))
                  } else {
                    message.error(mapPluginInstallError(result.error, t))
                  }
                } catch (err) {
                  hide()
                  message.error(err instanceof Error ? err.message : t('common:settings.pluginInstallErrorGeneric'))
                }
              })()
            }}
          >
            {t('common:settings.pluginInstallNow')}
          </Button>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 4 }}
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
        </Space>
      </span>
    ),
  })
}
