import { describe, expect, it } from 'vitest'
import { detectPluginInstallRequired } from './pluginInstallPrompt'

/** UX-35: plugins are installed on demand when a feature needs them. */
describe('plugin on-demand install policy', () => {
  it('detects document-import when PDF import fails without plugin', () => {
    expect(
      detectPluginInstallRequired({
        errorCode: 'PLUGIN_NOT_INSTALLED',
        pluginId: 'document-import',
      }),
    ).toEqual({ required: true, pluginId: 'document-import' })
  })

  it('detects offline-speech when Whisper unavailable', () => {
    expect(
      detectPluginInstallRequired({
        errorCode: 'PLUGIN_NOT_INSTALLED',
        pluginId: 'offline-speech',
      }),
    ).toEqual({ required: true, pluginId: 'offline-speech' })
  })
})
