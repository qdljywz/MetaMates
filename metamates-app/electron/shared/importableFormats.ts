/**
 * 可导入为情报笔记的文档格式（Main / Renderer 共用）
 */

export type DocumentFormat =
  | 'text'
  | 'markdown'
  | 'html'
  | 'csv'
  | 'json'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'image'

/** Built into the main app (no optional plugin). */
export type CoreDocumentFormat = 'text' | 'markdown' | 'html' | 'csv' | 'json'

/** Requires the document-import plugin package. */
export type ExtendedDocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'image'

const EXTENDED_FORMATS = new Set<ExtendedDocumentFormat>(['pdf', 'docx', 'xlsx', 'image'])

const EXT_TO_FORMAT: Record<string, DocumentFormat> = {
  '.txt': 'text',
  '.log': 'text',
  '.text': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.json': 'json',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.tif': 'image',
  '.tiff': 'image',
}

export const SUPPORTED_IMPORT_EXTENSIONS = Object.freeze(Object.keys(EXT_TO_FORMAT))

/**
 * @param filePath - 文件路径
 * @returns 文档格式，不支持则 null
 */
export function getDocumentFormat(filePath: string): DocumentFormat | null {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_TO_FORMAT[lower.slice(dot)] ?? null
}

/**
 * @param filePath - 文件路径
 */
export function isImportableDocument(filePath: string): boolean {
  return getDocumentFormat(filePath) !== null
}

export function requiresDocumentImportPlugin(format: DocumentFormat): format is ExtendedDocumentFormat {
  return EXTENDED_FORMATS.has(format as ExtendedDocumentFormat)
}

export function isCoreImportableDocument(filePath: string): boolean {
  const format = getDocumentFormat(filePath)
  return format !== null && !requiresDocumentImportPlugin(format)
}

/** 文件选择对话框过滤器 */
export const IMPORT_FILE_DIALOG_FILTERS = [
  { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'tsv', 'txt', 'md', 'html', 'htm', 'json'] },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'] },
  { name: 'All Files', extensions: ['*'] },
]
