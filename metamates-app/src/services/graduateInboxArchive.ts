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

/** True when `absPath` is a direct child of Inbox/ (not already under processed/). */
export function isActiveInboxNotePath(inboxDir: string, absPath: string): boolean {
  const absNorm = absPath.replace(/\\/g, '/')
  const inboxNorm = inboxDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const lower = absNorm.toLowerCase()
  if (!lower.startsWith(`${inboxNorm.toLowerCase()}/`)) return false
  if (lower.includes('/processed/')) return false
  const relative = absNorm.slice(inboxNorm.length + 1)
  return relative.length > 0 && !relative.includes('/')
}

async function resolveInboxCandidateAbs(
  workspacePath: string,
  inboxDir: string,
  candidate: string,
): Promise<string | null> {
  const api = window.electronAPI
  if (!api?.path?.join) return null
  const normalized = candidate.replace(/\\/g, '/').trim()
  const abs = /^[A-Za-z]:[/\\]/.test(normalized)
    ? normalized
    : await api.path.join(workspacePath, normalized.replace(/^\.?[\\/]+/, ''))
  return isActiveInboxNotePath(inboxDir, abs) ? abs : null
}

/**
 * Move inbox notes to Inbox/processed/ after successful /graduate or /intel.
 */
export async function archiveProcessedInboxNotes(options: {
  workspacePath: string
  language: WorkspaceLanguage
  sourceTexts?: string[]
  explicitPaths?: string[]
}): Promise<{ moved: string[]; skipped: string[] }> {
  const { workspacePath, language, sourceTexts = [], explicitPaths = [] } = options
  const api = window.electronAPI
  if (!api?.path?.join || !api.renameFile || !api.fileExists || !api.createDirectory) {
    return { moved: [], skipped: [] }
  }

  const inboxDir = await resolveInboxDirPath(workspacePath, language)
  const processedDir = await api.path.join(inboxDir, 'processed')
  await api.createDirectory(processedDir)

  const rawCandidates = [
    ...explicitPaths,
    ...sourceTexts.flatMap((text) => extractInboxMarkdownCandidates(text)),
  ]
  const deduped = new Set<string>()
  const moved: string[] = []
  const skipped: string[] = []

  for (const candidate of rawCandidates) {
    const abs = await resolveInboxCandidateAbs(workspacePath, inboxDir, candidate)
    if (!abs) {
      skipped.push(candidate)
      continue
    }
    const absKey = abs.replace(/\\/g, '/').toLowerCase()
    if (deduped.has(absKey)) continue
    deduped.add(absKey)

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

/** @deprecated Use archiveProcessedInboxNotes */
export async function archiveGraduatedInboxNotes(options: {
  workspacePath: string
  language: WorkspaceLanguage
  sourceTexts: string[]
}): Promise<{ moved: string[]; skipped: string[] }> {
  return archiveProcessedInboxNotes({
    workspacePath: options.workspacePath,
    language: options.language,
    sourceTexts: options.sourceTexts,
  })
}

/** Resolve absolute path when it is an unprocessed Inbox note. */
export async function detectInboxSourcePath(
  workspacePath: string,
  language: WorkspaceLanguage,
  sourcePath: string,
): Promise<string | undefined> {
  const inboxDir = await resolveInboxDirPath(workspacePath, language)
  const abs = await resolveInboxCandidateAbs(workspacePath, inboxDir, sourcePath)
  return abs ?? undefined
}
