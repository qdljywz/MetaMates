import * as fs from 'fs'
import * as path from 'path'
import type { DocumentFormat } from '../shared/importableFormats'
import { requiresDocumentImportPlugin } from '../shared/importableFormats'
import {
  extractViaDocumentImportPlugin,
  PLUGIN_NOT_INSTALLED,
} from '../pluginRuntime/documentImportPlugin'
import { DOCUMENT_IMPORT_PLUGIN_ID } from '../pluginRuntime/pluginManifest'

export interface DocumentExtractResult {
  success: boolean
  format: DocumentFormat
  mimeType: string
  text: string
  metadata?: Record<string, string>
  warnings?: string[]
  error?: string
  errorCode?: string
  pluginId?: string
}

const MAX_EXTRACT_CHARS = 120_000

/**
 * 去除 HTML 标签保留可读文本
 * @param html - 原始 HTML
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 将 CSV/TSV 前几行格式化为 Markdown 表格
 * @param raw - 原始 CSV 文本
 */
function csvToMarkdownPreview(raw: string, maxRows = 40): string {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return ''
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const rows = lines.slice(0, maxRows).map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, '')),
  )
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => {
    while (row.length < width) row.push('')
    return row
  })
  const header = normalized[0]
  const sep = header.map(() => '---')
  const body = normalized.slice(1)
  const table = [header, sep, ...body]
    .map((row) => `| ${row.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n')
  if (lines.length > maxRows) {
    return `${table}\n\n…（共 ${lines.length} 行，仅展示前 ${maxRows} 行）`
  }
  return table
}

/**
 * 从工作区文件提取纯文本
 * @param resolvedPath - 已通过沙箱校验的绝对路径
 * @param format - 文档格式
 * @param mimeType - MIME 类型
 */
export async function extractDocumentText(
  resolvedPath: string,
  format: DocumentFormat,
  mimeType: string,
): Promise<DocumentExtractResult> {
  if (requiresDocumentImportPlugin(format)) {
    const pluginResult = await extractViaDocumentImportPlugin(resolvedPath, format, mimeType)
    if (!pluginResult.success && pluginResult.error === PLUGIN_NOT_INSTALLED) {
      return {
        ...pluginResult,
        errorCode: PLUGIN_NOT_INSTALLED,
        pluginId: DOCUMENT_IMPORT_PLUGIN_ID,
        error: PLUGIN_NOT_INSTALLED,
      }
    }
    return pluginResult
  }

  const warnings: string[] = []

  try {
    let text = ''

    switch (format) {
      case 'text':
      case 'markdown': {
        text = fs.readFileSync(resolvedPath, 'utf-8')
        break
      }
      case 'html': {
        text = stripHtml(fs.readFileSync(resolvedPath, 'utf-8'))
        break
      }
      case 'json': {
        const raw = fs.readFileSync(resolvedPath, 'utf-8')
        try {
          text = JSON.stringify(JSON.parse(raw), null, 2)
        } catch {
          text = raw
          warnings.push('JSON 解析失败，已按纯文本处理')
        }
        break
      }
      case 'csv': {
        text = csvToMarkdownPreview(fs.readFileSync(resolvedPath, 'utf-8'))
        break
      }
      default:
        return {
          success: false,
          format,
          mimeType,
          text: '',
          error: `Unsupported format: ${format}`,
        }
    }

    if (text.length > MAX_EXTRACT_CHARS) {
      text = `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n…（内容已截断）`
      warnings.push(`提取文本超过 ${MAX_EXTRACT_CHARS} 字符，已截断`)
    }

    return {
      success: true,
      format,
      mimeType,
      text,
      metadata: {
        fileName: path.basename(resolvedPath),
        charCount: String(text.length),
      },
      warnings: warnings.length ? warnings : undefined,
    }
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
