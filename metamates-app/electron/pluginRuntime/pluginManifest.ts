export const DOCUMENT_IMPORT_PLUGIN_ID = 'document-import'
export const OFFLINE_SPEECH_PLUGIN_ID = 'offline-speech'

export interface PluginManifestGithub {
  owner: string
  repo: string
  assetTemplate: string
}

export interface PluginManifest {
  id: string
  name: string
  nameZh?: string
  version: string
  description?: string
  descriptionZh?: string
  main: string
  apiVersion: number
  formats?: string[]
  sizeHintMb?: number
  github?: PluginManifestGithub
}

export function pluginReleaseAssetName(manifest: PluginManifest, appVersion: string): string | null {
  if (!manifest.github?.assetTemplate) return null
  return manifest.github.assetTemplate.replace('{version}', appVersion)
}

export function pluginReleaseDownloadUrl(manifest: PluginManifest, appVersion: string): string | null {
  if (!manifest.github) return null
  const asset = pluginReleaseAssetName(manifest, appVersion)
  if (!asset) return null
  const { owner, repo } = manifest.github
  return `https://github.com/${owner}/${repo}/releases/download/v${appVersion}/${asset}`
}
