export const PLUGIN_NOT_INSTALLED_CODE = 'PLUGIN_NOT_INSTALLED'

export type PluginInstallFocusId = 'document-import' | 'offline-speech'

export interface PluginInstallRequired {
  required: true
  pluginId: PluginInstallFocusId
}

export function detectPluginInstallRequired(payload: {
  errorCode?: string
  pluginId?: string
  error?: string
}): PluginInstallRequired | { required: false } {
  if (payload.errorCode === PLUGIN_NOT_INSTALLED_CODE) {
    const pluginId = payload.pluginId === 'offline-speech' ? 'offline-speech' : 'document-import'
    return { required: true, pluginId }
  }
  if (payload.error?.includes('设置 → 扩展') || payload.error?.includes('Settings → Extensions')) {
    return { required: true, pluginId: 'document-import' }
  }
  return { required: false }
}
