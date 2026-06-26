import * as fs from 'fs'
import * as path from 'path'
import { assertWithinWorkspace } from '../shared/pathSafety'
import { getDocumentFormat } from '../shared/importableFormats'
import { getLayout, type WorkspaceLanguage } from '../workspaceLayout'
import { extractDocumentText } from './extractDocument'
import { getMimeTypeFromPath } from './mimeType'

export interface IntelligencePrepareResult {
  success: boolean
  error?: string
  format?: string
  mimeType?: string
  text?: string
  metadata?: Record<string, string>
  warnings?: string[]
  sourceFileName?: string
  sourceRelativePath?: string
  archivedRelativePath?: string
  archivedAbsolutePath?: string
  sourceCopied?: boolean
}

/**
 * 在目标目录生成不冲突的文件路径
 * @param dir - 目标目录
 * @param baseName - 原始文件名
 */
function uniqueArchivePath(dir: string, baseName: string): string {
  const candidate = path.join(dir, baseName)
  if (!fs.existsSync(candidate)) return candidate
  const ext = path.extname(baseName)
  const stem = path.basename(baseName, ext)
  let index = 1
  while (fs.existsSync(path.join(dir, `${stem}-${index}${ext}`))) {
    index += 1
  }
  return path.join(dir, `${stem}-${index}${ext}`)
}

/**
 * 提取文档文本并将原件归档到 04_/sources/
 * @param workspacePath - 工作区根
 * @param sourcePath - 源文件路径（可在工作区外）
 * @param language - 工作区语言
 */
export async function prepareIntelligenceImport(
  workspacePath: string,
  sourcePath: string,
  language: WorkspaceLanguage = 'zh',
): Promise<IntelligencePrepareResult> {
  if (!workspacePath?.trim()) {
    return { success: false, error: 'No workspace selected' }
  }

  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { success: false, error: 'Source file not found' }
  }

  const format = getDocumentFormat(resolved)
  if (!format) {
    return { success: false, error: 'Unsupported file format for intelligence import' }
  }

  const layout = getLayout(language)
  const intelligenceDir = path.join(workspacePath, layout.INTELLIGENCE)
  const sourcesDir = path.join(intelligenceDir, 'sources')
  fs.mkdirSync(sourcesDir, { recursive: true })

  const insideWorkspace = assertWithinWorkspace(workspacePath, resolved).ok
  const sourcesPrefix = `${layout.INTELLIGENCE}/sources/`.replace(/\\/g, '/')
  const sourceRelativeInside = insideWorkspace
    ? path.relative(workspacePath, resolved).replace(/\\/g, '/')
    : path.basename(resolved)
  const alreadyArchived = insideWorkspace && sourceRelativeInside.startsWith(sourcesPrefix)

  let extractPath = resolved
  let archivedAbsolute = resolved
  let archivedRelative = sourceRelativeInside
  let sourceCopied = false

  if (!alreadyArchived) {
    archivedAbsolute = uniqueArchivePath(sourcesDir, path.basename(resolved))
    fs.copyFileSync(resolved, archivedAbsolute)
    extractPath = archivedAbsolute
    archivedRelative = path.relative(workspacePath, archivedAbsolute).replace(/\\/g, '/')
    sourceCopied = true
    if (!insideWorkspace) {
      sourceCopied = true
    }
  }

  const mimeType = getMimeTypeFromPath(extractPath)
  const extracted = await extractDocumentText(extractPath, format, mimeType)
  if (!extracted.success) {
    return { success: false, error: extracted.error || 'Extraction failed' }
  }

  const warnings = [...(extracted.warnings || [])]
  if (!insideWorkspace) {
    warnings.unshift('源文件来自工作区外，已复制到 sources/')
  }

  return {
    success: true,
    format: extracted.format,
    mimeType: extracted.mimeType,
    text: extracted.text,
    metadata: extracted.metadata,
    warnings: warnings.length ? warnings : undefined,
    sourceFileName: path.basename(resolved),
    sourceRelativePath: archivedRelative,
    archivedRelativePath: archivedRelative,
    archivedAbsolutePath: archivedAbsolute,
    sourceCopied,
  }
}
