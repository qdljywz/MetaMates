import { createRequire } from 'module'
import * as path from 'path'
import type { DocumentFormat } from '../shared/importableFormats'
import { requiresDocumentImportPlugin } from '../shared/importableFormats'
import type { DocumentExtractResult } from '../documentExtract/extractDocument'
import { DOCUMENT_IMPORT_PLUGIN_ID } from './pluginManifest'
import { readPluginManifest, resolveBundledPluginZip, resolvePluginRoot } from './pluginPaths'

export const PLUGIN_NOT_INSTALLED = 'PLUGIN_NOT_INSTALLED'

export interface DocumentImportPluginStatus {
  id: string
  installed: boolean
  version?: string
  name?: string
  nameZh?: string
  description?: string
  descriptionZh?: string
  devBundled?: boolean
  bundledZipAvailable?: boolean
}

export function getDocumentImportPluginStatus(): DocumentImportPluginStatus {
  const installedRoot = resolvePluginRoot(DOCUMENT_IMPORT_PLUGIN_ID)
  const manifest = installedRoot ? readPluginManifest(installedRoot) : null
  const devBundled = !!installedRoot && installedRoot.includes(`${path.sep}plugins${path.sep}document-import`)

  return {
    id: DOCUMENT_IMPORT_PLUGIN_ID,
    installed: !!installedRoot,
    version: manifest?.version,
    name: manifest?.name,
    nameZh: manifest?.nameZh,
    description: manifest?.description,
    descriptionZh: manifest?.descriptionZh,
    devBundled,
    bundledZipAvailable: !!resolveBundledPluginZip(DOCUMENT_IMPORT_PLUGIN_ID),
  }
}

export function isDocumentImportPluginReady(): boolean {
  return getDocumentImportPluginStatus().installed
}

export function pluginRequiredErrorMessage(format: DocumentFormat): string {
  return `需要安装「文档导入」扩展才能导入 ${format.toUpperCase()} 文件。请在 设置 → 扩展 中安装。`
}

/**
 * Delegate PDF/DOCX/XLSX/image extraction to the optional plugin package.
 */
export async function extractViaDocumentImportPlugin(
  resolvedPath: string,
  format: DocumentFormat,
  mimeType: string,
): Promise<DocumentExtractResult> {
  if (!requiresDocumentImportPlugin(format)) {
    return {
      success: false,
      format,
      mimeType,
      text: '',
      error: `Format ${format} is not handled by document-import plugin`,
    }
  }

  const pluginRoot = resolvePluginRoot(DOCUMENT_IMPORT_PLUGIN_ID)
  if (!pluginRoot) {
    return {
      success: false,
      format,
      mimeType,
      text: '',
      error: PLUGIN_NOT_INSTALLED,
    }
  }

  const manifest = readPluginManifest(pluginRoot)
  const mainFile = manifest?.main || 'extractExtended.cjs'
  const mainPath = path.join(pluginRoot, mainFile)

  try {
    const req = createRequire(mainPath)
    const mod = req(mainPath) as {
      extractDocumentText?: (
        resolvedPath: string,
        format: string,
        mimeType: string,
      ) => Promise<DocumentExtractResult>
    }
    if (typeof mod.extractDocumentText !== 'function') {
      return {
        success: false,
        format,
        mimeType,
        text: '',
        error: 'Document import plugin is missing extractDocumentText export',
      }
    }
    return mod.extractDocumentText(resolvedPath, format, mimeType)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      format,
      mimeType,
      text: '',
      error: message,
    }
  }
}
