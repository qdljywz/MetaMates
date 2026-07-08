import {
  getDailyPlanDir,
  parseDailyEntryFileName,
  type WorkspaceLanguage,
} from '../constants/paths'
import {
  detectWorkspaceLanguageFromPaths,
  getRelativeVaultPath,
  isVaultContentFile,
} from '../services/vaultPaths'

export interface VaultActivitySnapshot {
  byDate: Map<string, VaultActivityEntry[]>
  noteDates: Set<string>
  planDates: Set<string>
  recent: VaultActivityEntry[]
}

export interface VaultActivityEntry {
  path: string
  name: string
  relativePath: string
  lastModified: number
  editDateStr: string
  dailyKind: 'note' | 'plan' | null
}

export function toLocalDateString(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatEditTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isDirectDailyEntryFile(
  workspacePath: string,
  filePath: string,
  dailyDir: string,
): boolean {
  const rel = getRelativeVaultPath(workspacePath, filePath).replace(/\\/g, '/')
  const prefix = `${dailyDir.replace(/\\/g, '/')}/`
  if (!rel.startsWith(prefix)) return false
  const rest = rel.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/')
}

export function buildVaultActivityIndex(
  workspacePath: string,
  files: { name: string; path: string; lastModified: number }[],
  language: WorkspaceLanguage,
): VaultActivitySnapshot {
  const byDate = new Map<string, VaultActivityEntry[]>()
  const noteDates = new Set<string>()
  const planDates = new Set<string>()
  const recent: VaultActivityEntry[] = []
  const dailyDir = getDailyPlanDir(language)

  for (const file of files) {
    if (isDirectDailyEntryFile(workspacePath, file.path, dailyDir)) {
      const parsed = parseDailyEntryFileName(file.name)
      if (parsed?.kind === 'note') noteDates.add(parsed.dateStr)
      if (parsed?.kind === 'plan') planDates.add(parsed.dateStr)
    }

    if (!isVaultContentFile(workspacePath, file.path, language)) continue
    if (!file.lastModified || file.lastModified <= 0) continue

    const parsed = parseDailyEntryFileName(file.name)
    const editDateStr = toLocalDateString(file.lastModified)
    const entry: VaultActivityEntry = {
      path: file.path,
      name: file.name,
      relativePath: getRelativeVaultPath(workspacePath, file.path),
      lastModified: file.lastModified,
      editDateStr,
      dailyKind: parsed?.kind ?? null,
    }
    recent.push(entry)
    const bucket = byDate.get(editDateStr) ?? []
    bucket.push(entry)
    byDate.set(editDateStr, bucket)
  }

  for (const [date, list] of byDate) {
    byDate.set(date, list.sort((a, b) => b.lastModified - a.lastModified))
  }
  recent.sort((a, b) => b.lastModified - a.lastModified)

  return { byDate, noteDates, planDates, recent }
}

const EMPTY_SNAPSHOT: VaultActivitySnapshot = {
  byDate: new Map(),
  noteDates: new Set(),
  planDates: new Set(),
  recent: [],
}

/**
 * 活动日历始终从磁盘 listFiles 读取 mtime（比索引更准确）。
 */
export async function loadVaultActivitySnapshot(
  workspacePath: string,
  language?: WorkspaceLanguage,
): Promise<VaultActivitySnapshot> {
  if (!window.electronAPI) return EMPTY_SNAPSHOT

  const result = await window.electronAPI.listFiles(workspacePath, true)
  if (!result.success || !result.files) return EMPTY_SNAPSHOT

  const diskLanguage =
    language ||
    detectWorkspaceLanguageFromPaths(
      workspacePath,
      result.files.map((f) => f.path),
    )

  const mdFiles = result.files
    .filter((f) => !f.isDirectory && f.name.toLowerCase().endsWith('.md'))
    .map((f) => ({
      name: f.name,
      path: f.path,
      lastModified: typeof f.modified === 'number' ? f.modified : 0,
    }))

  return buildVaultActivityIndex(workspacePath, mdFiles, diskLanguage)
}

export function activityLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}
