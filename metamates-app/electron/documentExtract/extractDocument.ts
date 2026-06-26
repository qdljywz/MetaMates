import * as fs from 'fs'
import * as path from 'path'
import type { DocumentFormat } from '../shared/importableFormats'

export interface DocumentExtractResult {
  success: boolean
  format: DocumentFormat
  mimeType: string
  text: string
  metadata?: Record<string, string>
  warnings?: string[]
  error?: string
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

let ocrWorker: import('tesseract.js').Worker | null = null

/**
 * OCR 识别图片文字（懒加载 worker）
 * @param imagePath - 图片绝对路径
 */
async function extractImageText(imagePath: string): Promise<{ text: string; warnings: string[] }> {
  const { createWorker } = await import('tesseract.js')
  if (!ocrWorker) {
    ocrWorker = await createWorker('chi_sim+eng')
  }
  const { data } = await ocrWorker.recognize(imagePath)
  const text = (data.text || '').trim()
  const warnings: string[] = []
  if (!text) {
    warnings.push('OCR 未识别到文字，请在 Agent 面板附加图片请求视觉摘要')
  } else if (data.confidence < 45) {
    warnings.push(`OCR 置信度较低（${Math.round(data.confidence)}%），摘要可能不完整`)
  }
  return { text, warnings }
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
      case 'pdf': {
        const { PDFParse } = await import('pdf-parse') as typeof import('pdf-parse')
        const buffer = fs.readFileSync(resolvedPath)
        const parser = new PDFParse({ data: buffer })
        try {
          const parsed = await parser.getText()
          text = (parsed.text || '').trim()
          if (parsed.total) {
            warnings.push(`PDF 共 ${parsed.total} 页`)
          }
        } finally {
          await parser.destroy()
        }
        if (!text) {
          warnings.push('PDF 未提取到文本层，可能是扫描件；可尝试导出图片后重新导入')
        }
        break
      }
      case 'docx': {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ path: resolvedPath })
        text = (result.value || '').trim()
        if (result.messages?.length) {
          warnings.push(...result.messages.map((m) => m.message).slice(0, 3))
        }
        break
      }
      case 'xlsx': {
        const XLSX = await import('xlsx')
        const workbook = XLSX.readFile(resolvedPath, { cellDates: true })
        const chunks: string[] = []
        for (const sheetName of workbook.SheetNames.slice(0, 5)) {
          const sheet = workbook.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet)
          chunks.push(`## Sheet: ${sheetName}\n\n${csvToMarkdownPreview(csv, 30)}`)
        }
        text = chunks.join('\n\n')
        if (workbook.SheetNames.length > 5) {
          warnings.push(`工作簿共 ${workbook.SheetNames.length} 个工作表，仅提取前 5 个`)
        }
        break
      }
      case 'image': {
        const ocr = await extractImageText(resolvedPath)
        text = ocr.text
        warnings.push(...ocr.warnings)
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
  } catch (error: any) {
    return {
      success: false,
      format,
      mimeType,
      text: '',
      error: error.message || String(error),
    }
  }
}
