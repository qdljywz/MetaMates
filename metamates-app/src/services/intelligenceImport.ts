import {
  getWorkspaceLayout,
  getTodayDateString,
  resolveWorkspaceFilePath,
  type WorkspaceLanguage,
} from '../constants/paths'
import {
  buildIntelligenceNoteFileName,
  summarizeExtractedText,
  titleFromSourceFileName,
  truncateExcerpt,
} from './intelligenceSummarize'
import { workspaceIndexService } from './workspaceIndex'
import { IMPORT_FILE_DIALOG_FILTERS } from '../../electron/shared/importableFormats'
import {
  extractUrlsFromText,
  parseIntelCaptureTarget,
  titleFromUrl,
} from '../utils/intelligenceCapture'

export interface IntelligencePreparePayload {
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
  sourceUrl?: string
  finalUrl?: string
  title?: string
}

export interface IntelligenceImportResult {
  success: boolean
  error?: string
  notePath?: string
  noteName?: string
  warnings?: string[]
  sourceLabel?: string
  extractedPreview?: string
}

export interface IntelligenceNoteParams {
  title: string
  format: string
  sourceRelativePath?: string
  sourceUrl?: string
  importedAt: string
  language: WorkspaceLanguage
  extractedText: string
  warnings?: string[]
}

/**
 * 构建情报笔记 Markdown 正文
 */
export function buildIntelligenceNoteContent(params: IntelligenceNoteParams): string {
  const summary = summarizeExtractedText(params.extractedText)
  const excerpt = truncateExcerpt(params.extractedText)
  const layout = getWorkspaceLayout(params.language)
  const tags = ['情报', params.format]
  const sourceLine = params.sourceUrl
    ? params.sourceUrl
    : params.sourceRelativePath || 'unknown'

  const keyPointsBlock = summary.keyPoints.length
    ? summary.keyPoints.map((p) => `- ${p}`).join('\n')
    : '- （暂无自动提取要点，可在下方补充或由 Agent 深化）'

  const dataBlock = summary.dataSection
    ? `\n## 关键数据\n\n${summary.dataSection}\n`
    : ''

  const warningsBlock = params.warnings?.length
    ? `\n> ⚠️ ${params.warnings.join('；')}\n`
    : ''

  const frontmatterSource = params.sourceUrl
    ? `source_url: ${params.sourceUrl}`
    : `source_path: ${params.sourceRelativePath}`

  return `---
type: intelligence
source_format: ${params.format}
${frontmatterSource}
imported_at: ${params.importedAt}
tags: [${tags.join(', ')}]
---

# ${params.title}

> 外部情报摘要 · 来源：${params.sourceUrl ? `[链接](${params.sourceUrl})` : `\`${sourceLine}\``}${warningsBlock}

## 核心结论

${summary.overview}

## 关键要点

${keyPointsBlock}
${dataBlock}
## 关联

- 目录：[[${layout.INTELLIGENCE}/Intelligence_Home]]
${params.sourceUrl ? `- 原文链接：${params.sourceUrl}` : `- 原件路径：\`${sourceLine}\``}

## 原文摘录

${excerpt.startsWith('|') ? excerpt : `\`\`\`\n${excerpt}\n\`\`\``}
`
}

async function writeIntelligenceNote(
  workspacePath: string,
  language: WorkspaceLanguage,
  params: Omit<IntelligenceNoteParams, 'language'> & { language?: WorkspaceLanguage },
): Promise<IntelligenceImportResult> {
  const lang = params.language || language
  const layout = getWorkspaceLayout(lang)
  const intelligenceDir = `${workspacePath}/${layout.INTELLIGENCE}`.replace(/\\/g, '/')
  await window.electronAPI!.createDirectory(intelligenceDir)
  await window.electronAPI!.createDirectory(`${intelligenceDir}/sources`)

  const date = getTodayDateString()
  const noteName = buildIntelligenceNoteFileName(date, params.title)
  let notePath = await window.electronAPI!.path.join(intelligenceDir, noteName)

  const exists = await window.electronAPI!.fileExists(notePath)
  if (exists.exists) {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-')
    notePath = await window.electronAPI!.path.join(
      intelligenceDir,
      buildIntelligenceNoteFileName(date, `${params.title}_${stamp}`),
    )
  }

  const content = buildIntelligenceNoteContent({ ...params, language: lang })
  const writeResult = await window.electronAPI!.writeFile(notePath, content)
  if (!writeResult.success) {
    return { success: false, error: writeResult.error || 'Failed to write intelligence note' }
  }

  if (workspaceIndexService.getWorkspacePath() === workspacePath) {
    await workspaceIndexService.rebuild(workspacePath)
  }

  return {
    success: true,
    notePath,
    noteName: notePath.split(/[/\\]/).pop() || noteName,
    warnings: params.warnings,
    sourceLabel: params.sourceUrl || params.sourceRelativePath,
    extractedPreview: params.extractedText,
  }
}

export async function importDocumentAsIntelligence(
  workspacePath: string,
  sourcePath: string,
  language: WorkspaceLanguage = 'zh',
): Promise<IntelligenceImportResult> {
  if (!window.electronAPI?.intelligence?.prepareImport) {
    return { success: false, error: 'Intelligence import is only available in the desktop app' }
  }

  const prepared = await window.electronAPI.intelligence.prepareImport(sourcePath) as IntelligencePreparePayload
  if (!prepared.success || !prepared.text) {
    return { success: false, error: prepared.error || 'Failed to prepare import' }
  }

  const title = titleFromSourceFileName(prepared.sourceFileName || 'intel')
  return writeIntelligenceNote(workspacePath, language, {
    title,
    format: prepared.format || 'file',
    sourceRelativePath: prepared.archivedRelativePath || prepared.sourceRelativePath || prepared.sourceFileName || '',
    importedAt: new Date().toISOString(),
    extractedText: prepared.text,
    warnings: prepared.warnings,
  })
}

export async function importUrlAsIntelligence(
  workspacePath: string,
  rawUrl: string,
  language: WorkspaceLanguage = 'zh',
): Promise<IntelligenceImportResult> {
  if (!window.electronAPI?.intelligence?.prepareUrl) {
    return { success: false, error: 'URL intelligence import requires the desktop app' }
  }

  const prepared = await window.electronAPI.intelligence.prepareUrl(rawUrl) as IntelligencePreparePayload
  if (!prepared.success || !prepared.text) {
    return { success: false, error: prepared.error || 'Failed to fetch URL' }
  }

  const title = titleFromUrl(prepared.finalUrl || prepared.sourceUrl || rawUrl, prepared.title)
  return writeIntelligenceNote(workspacePath, language, {
    title,
    format: 'url',
    sourceUrl: prepared.finalUrl || prepared.sourceUrl || rawUrl,
    importedAt: new Date().toISOString(),
    extractedText: prepared.text,
    warnings: prepared.warnings,
  })
}

export async function captureIntelligenceFromText(
  workspacePath: string,
  text: string,
  language: WorkspaceLanguage = 'zh',
): Promise<IntelligenceImportResult> {
  const target = parseIntelCaptureTarget(text)
  if (!target) {
    const urls = extractUrlsFromText(text)
    if (urls.length === 0) {
      return { success: false, error: 'No URL or file path found' }
    }
    return importUrlAsIntelligence(workspacePath, urls[0], language)
  }

  if (target.kind === 'url') {
    return importUrlAsIntelligence(workspacePath, target.value, language)
  }

  const resolved = await resolveWorkspaceFilePath(
    workspacePath,
    target.value,
    language,
    workspaceIndexService.isReady() ? workspaceIndexService.getAllFiles() : [],
  )
  if (!resolved) {
    return { success: false, error: `File not found: ${target.value}` }
  }
  return importDocumentAsIntelligence(workspacePath, resolved, language)
}

export function buildIntelligenceEnhancePrompt(
  result: IntelligenceImportResult,
  excerpt: string,
  language: WorkspaceLanguage = 'zh',
): string {
  const layout = getWorkspaceLayout(language)
  const intelDir = layout.INTELLIGENCE
  if (language === 'en') {
    return `An intelligence note was created at ${result.notePath} under ${intelDir}/.
Source: ${result.sourceLabel}

Please read the excerpt below and UPDATE that markdown file:
1. Strengthen "核心结论" with 3-5 high-value insights
2. Refine "关键要点" bullets (actionable, specific)
3. Add "关联" links to relevant notes in the vault if any exist
4. Keep frontmatter; do not delete the excerpt section

Excerpt:
---
${excerpt.slice(0, 12000)}
---`
  }

  return `已在 ${intelDir}/ 创建情报笔记：${result.notePath}
来源：${result.sourceLabel}

请阅读下方摘录，并**直接更新**该 Markdown 文件：
1. 深化「核心结论」——输出 3-5 条高价值洞察
2. 优化「关键要点」——具体、可行动
3. 在「关联」中链接工作区内相关笔记（如有）
4. 保留 frontmatter 与「原文摘录」章节

摘录：
---
${excerpt.slice(0, 12000)}
---`
}

export async function pickAndImportIntelligence(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh',
): Promise<IntelligenceImportResult> {
  if (!window.electronAPI) {
    return { success: false, error: 'Electron API unavailable' }
  }

  const picked = await window.electronAPI.selectFile(IMPORT_FILE_DIALOG_FILTERS)
  if (picked.canceled || !picked.filePath) {
    return { success: false, error: 'canceled' }
  }

  return importDocumentAsIntelligence(workspacePath, picked.filePath, language)
}
