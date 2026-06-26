import { getTodayDateString, type WorkspaceLanguage } from '../constants/paths'
import { SLASH_WRITE_POLICIES, type SlashWritePolicy } from './slashWritePolicy'

const LAYOUT = {
  zh: {
    log: '01_日记与计划',
    templates: '05_模板与配置',
    insights: '03_点滴积累',
    inbox: '01_日记与计划/Inbox',
    intelligence: '04_情报与连接',
  },
  en: {
    log: '01_Log_and_Plan',
    templates: '05_Templates_and_Config',
    insights: '03_Insights',
    inbox: '01_Log_and_Plan/Inbox',
    intelligence: '04_Intelligence',
  },
} as const

export interface SlashWriteTargetCheck {
  relativePath: string
  ok: boolean
  detail: string
}

export interface SlashWritebackVerifyResult {
  cmdId: string
  skipped: boolean
  ok: boolean
  targets: SlashWriteTargetCheck[]
  summaryKey: 'success' | 'failed' | 'skipped'
}

function resolveTargetTemplates(policy: SlashWritePolicy, lang: WorkspaceLanguage): string[] {
  const layout = LAYOUT[lang]
  const projects = lang === 'zh' ? '02_项目与知识' : '02_Project_and_Knowledge'
  return policy.targets.map((t) =>
    t
      .replace('{log}', layout.log)
      .replace('{templates}', layout.templates)
      .replace('{insights}', layout.insights)
      .replace('{inbox}', layout.inbox)
      .replace('{intelligence}', layout.intelligence)
      .replace('{projects}', projects),
  )
}

/** Resolve slash write targets with today's date (Beijing). */
export function resolveSlashWriteTargetPaths(
  cmdId: string,
  lang: WorkspaceLanguage,
  dateStr: string = getTodayDateString(),
): string[] {
  const policy = SLASH_WRITE_POLICIES[cmdId]
  if (!policy?.targets.length) return []
  return resolveTargetTemplates(policy, lang).map((t) => t.replace(/YYYY-MM-DD/g, dateStr))
}

const MTIME_GRACE_MS = 20_000

async function joinWorkspace(workspacePath: string, relative: string): Promise<string> {
  const api = window.electronAPI
  if (!api?.path?.join) {
    return `${workspacePath.replace(/[/\\]+$/, '')}/${relative.replace(/\\/g, '/')}`
  }
  return api.path.join(workspacePath, relative.replace(/\\/g, '/'))
}

async function checkFileTarget(
  absPath: string,
  turnStartedAt: number,
  fileMode: SlashWritePolicy['fileMode'],
): Promise<SlashWriteTargetCheck> {
  const api = window.electronAPI
  if (!api?.fileExists || !api?.getFileStats) {
    return { relativePath: absPath, ok: false, detail: 'no file API' }
  }

  const exists = await api.fileExists(absPath)
  if (!exists?.exists) {
    return { relativePath: absPath, ok: false, detail: 'missing' }
  }

  const stats = await api.getFileStats(absPath)
  if (!stats?.success || !stats.stats) {
    return { relativePath: absPath, ok: fileMode === 'append', detail: 'exists (stats unavailable)' }
  }

  const modified = stats.stats.modified ?? 0
  const size = stats.stats.size ?? 0
  const recent = modified >= turnStartedAt - MTIME_GRACE_MS
  const hasContent = size > 0

  if (fileMode === 'append') {
    const ok = recent || hasContent
    return {
      relativePath: absPath,
      ok,
      detail: ok ? (recent ? 'updated' : 'has content') : 'not updated',
    }
  }

  const ok = recent && hasContent
  return {
    relativePath: absPath,
    ok,
    detail: ok ? 'written' : (hasContent ? 'stale mtime' : 'empty'),
  }
}

async function checkDirectoryTarget(
  absDir: string,
  turnStartedAt: number,
): Promise<SlashWriteTargetCheck> {
  const api = window.electronAPI
  if (!api?.listFiles || !api?.getFileStats) {
    return { relativePath: absDir, ok: false, detail: 'no list API' }
  }

  const listed = await api.listFiles(absDir, true)
  if (!listed?.success || !listed.files?.length) {
    return { relativePath: absDir, ok: false, detail: 'empty or missing' }
  }

  for (const entry of listed.files) {
    if (entry.isDirectory) continue
    if (!/\.(md|markdown)$/i.test(entry.name)) continue
    if (/记忆索引|Memory_Index|Intelligence_Home/i.test(entry.name)) continue

    const stats = await api.getFileStats(entry.path)
    if (!stats?.success || !stats.stats) continue
    if ((stats.stats.modified ?? 0) >= turnStartedAt - MTIME_GRACE_MS && (stats.stats.size ?? 0) > 0) {
      return { relativePath: absDir, ok: true, detail: `updated: ${entry.name}` }
    }
  }

  return { relativePath: absDir, ok: false, detail: 'no recent notes' }
}

/**
 * Post-turn verification: did required slash writeback land in the vault?
 */
export async function verifySlashWriteback(options: {
  cmdId: string
  workspacePath: string
  language: WorkspaceLanguage
  turnStartedAt: number
}): Promise<SlashWritebackVerifyResult> {
  const { cmdId, workspacePath, language, turnStartedAt } = options
  const policy = SLASH_WRITE_POLICIES[cmdId]

  if (!policy || policy.write === 'never' || !policy.verify) {
    return { cmdId, skipped: true, ok: true, targets: [], summaryKey: 'skipped' }
  }

  if (policy.write === 'optional') {
    return { cmdId, skipped: true, ok: true, targets: [], summaryKey: 'skipped' }
  }

  if (!workspacePath?.trim() || !window.electronAPI) {
    return {
      cmdId,
      skipped: false,
      ok: false,
      targets: [{ relativePath: '', ok: false, detail: 'no workspace' }],
      summaryKey: 'failed',
    }
  }

  const relatives = resolveSlashWriteTargetPaths(cmdId, language)
  const checks: SlashWriteTargetCheck[] = []

  for (const rel of relatives) {
    const isDir = rel.endsWith('/')
    const normalized = rel.replace(/\/+$/, '')
    const abs = await joinWorkspace(workspacePath, normalized)

    if (isDir) {
      checks.push(await checkDirectoryTarget(abs, turnStartedAt))
    } else {
      checks.push(await checkFileTarget(abs, turnStartedAt, policy.fileMode))
    }
  }

  const hasDirTargets = relatives.some((r) => r.endsWith('/'))
  const ok = hasDirTargets
    ? checks.some((c) => c.ok)
    : checks.length > 0 && checks.every((c) => c.ok)

  return {
    cmdId,
    skipped: false,
    ok,
    targets: checks,
    summaryKey: ok ? 'success' : 'failed',
  }
}
