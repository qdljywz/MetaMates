import { describe, expect, it } from 'vitest'
import { detectPluginInstallRequired, PLUGIN_NOT_INSTALLED_CODE } from './pluginInstallPrompt'

describe('detectPluginInstallRequired', () => {
  it('detects errorCode from IPC', () => {
    expect(
      detectPluginInstallRequired({
        errorCode: PLUGIN_NOT_INSTALLED_CODE,
        pluginId: 'document-import',
      }),
    ).toEqual({ required: true, pluginId: 'document-import' })
  })

  it('defaults pluginId to document-import', () => {
    expect(detectPluginInstallRequired({ errorCode: PLUGIN_NOT_INSTALLED_CODE })).toEqual({
      required: true,
      pluginId: 'document-import',
    })
  })

  it('supports legacy Chinese error text', () => {
    expect(
      detectPluginInstallRequired({ error: '需要安装「文档导入」扩展。请在 设置 → 扩展 中安装。' }),
    ).toEqual({ required: true, pluginId: 'document-import' })
  })

  it('supports legacy English error text', () => {
    expect(
      detectPluginInstallRequired({ error: 'Install from Settings → Extensions' }),
    ).toEqual({ required: true, pluginId: 'document-import' })
  })

  it('returns false for unrelated errors', () => {
    expect(detectPluginInstallRequired({ error: 'Extraction failed' })).toEqual({ required: false })
  })
})
