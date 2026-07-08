import { resolveInboxDirPath, type WorkspaceLanguage } from '../constants/paths'

/**
 * Extract candidate inbox markdown paths from assistant output text.
 */
export function extractInboxMarkdownCandidates(text: string): string[] {
  if (!text.trim()) return []
  const matches = new Set<string>()
  const regex =
    /([A-Za-z]:[^\s)\]]*Inbox[^\s)\]]*\.md|(?:\.{0,2}[\\/])?[^)\]\n\r]*Inbox[^)\]\n\r]*\.md)/gi
  let result: RegExpExecArray | null = regex.exec(text)
  while (result) {
    const cleaned = result[1]
      .replace(/^\s*[-*]\s*/, '')
      .replace(/^(?:来源|source)\s*[:：]\s*/i, '')
      .replace(/^\[\[/, '')
      .replace(/\]\]$/, '')
      .replace(/^[`'"]+|[`'"]+$/g, '')
      .replace(/[，。；、]+$/g, '')
      .trim()
    if (cleaned) matches.add(cleaned)
    result = regex.exec(text)
  }
  return [...matches]
}

/**
 * Move source inbox notes to Inbox/processed after successful /graduate.
 */
export async function archiveGraduatedInboxNotes(options: {
  workspacePath: string
  language: WorkspaceLanguage
  sourceTexts: string[]
}): Promise<{ moved: string[]; skipped: string[] }> {
  const { workspacePath, language, sourceTexts } = options
  const api = window.electronAPI
  if (!api?.path?.join || !api.renameFile || !api.fileExists || !api.createDirectory) {
    return { moved: [], skipped: [] }
  }

  const inboxDir = await resolveInboxDirPath(workspacePath, language)
  const processedDir = await api.path.join(inboxDir, 'processed')
  await api.createDirectory(processedDir)

  const rawCandidates = sourceTexts.flatMap((text) => extractInboxMarkdownCandidates(text))
  const deduped = new Set<string>()
  const moved: string[] = []
  const skipped: string[] = []

  for (const candidate of rawCandidates) {
    const normalized = candidate.replace(/\\/g, '/').trim()
    const abs = /^[A-Za-z]:[/\\]/.test(normalized)
      ? normalized
      : await api.path.join(workspacePath, normalized.replace(/^\.?[\\/]+/, ''))
    const absNorm = abs.replace(/\\/g, '/')
    const inboxNorm = inboxDir.replace(/\\/g, '/')
    if (!absNorm.toLowerCase().startsWith(inboxNorm.toLowerCase())) {
      skipped.push(candidate)
      continue
    }
    if (absNorm.toLowerCase().includes('/processed/')) continue
    if (deduped.has(absNorm.toLowerCase())) continue
    deduped.add(absNorm.toLowerCase())

    const exists = await api.fileExists(abs)
    if (!exists.exists) {
      skipped.push(candidate)
      continue
    }

    const baseName = abs.split(/[/\\]/).pop() || `inbox-${Date.now()}.md`
    const stampedName = `${Date.now()}-${baseName}`
    const destination = await api.path.join(processedDir, stampedName)
    const renamed = await api.renameFile(abs, destination)
    if (renamed.success) {
      moved.push(destination)
    } else {
      skipped.push(candidate)
    }
  }

  return { moved, skipped }
}
