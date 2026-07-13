'use strict'

const fs = require('fs')
const path = require('path')

const MAX_EXTRACT_CHARS = 120_000

let ocrWorker = null

async function extractImageText(imagePath) {
  const { createWorker } = await import('tesseract.js')
  if (!ocrWorker) {
    ocrWorker = await createWorker('chi_sim+eng')
  }
  const { data } = await ocrWorker.recognize(imagePath)
  const text = (data.text || '').trim()
  const warnings = []
  if (!text) {
    warnings.push('OCR 未识别到文字，请在 Agent 面板附加图片请求视觉摘要')
  } else if (data.confidence < 45) {
    warnings.push(`OCR 置信度较低（${Math.round(data.confidence)}%），摘要可能不完整`)
  }
  return { text, warnings }
}

function csvToMarkdownPreview(raw, maxRows = 40) {
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
 * @param {string} resolvedPath
 * @param {string} format
 * @param {string} mimeType
 */
async function extractDocumentText(resolvedPath, format, mimeType) {
  const warnings = []

  try {
    let text = ''

    switch (format) {
      case 'pdf': {
        const { PDFParse } = await import('pdf-parse')
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
        const chunks = []
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
          error: `Unsupported extended format: ${format}`,
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
  } catch (error) {
    return {
      success: false,
      format,
      mimeType,
      text: '',
      error: error?.message || String(error),
    }
  }
}

module.exports = { extractDocumentText }
