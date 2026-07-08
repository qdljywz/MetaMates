/**
 * 知识层 vs 配置层路径判定（图谱 / 索引 / 链接债务仅索引知识层）
 */

import {
  WORKSPACE_FILES,
  WORKSPACE_LAYOUT,
  getTemplatesDir,
  AGENT_ROOT_CONFIG_FILES,
  type WorkspaceLanguage,
} from '../constants/paths'

/** 将路径统一为 POSIX 风格便于比较 */
export function normalizeVaultPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * 计算 filePath 相对 workspacePath 的路径
 * @param workspacePath - 工作区根目录
 * @param filePath - 绝对或相对文件路径
 */
export function getRelativeVaultPath(workspacePath: string, filePath: string): string {
  const ws = normalizeVaultPath(workspacePath).replace(/\/+$/, '')
  const fp = normalizeVaultPath(filePath)
  const lowerWs = ws.toLowerCase()
  const lowerFp = fp.toLowerCase()
  if (lowerFp === lowerWs) return ''
  if (lowerFp.startsWith(`${lowerWs}/`)) {
    return fp.slice(ws.length + 1)
  }
  return fp
}

/**
 * 从已扫描路径推断工作区语言（不依赖 fs）
 * @param workspacePath - 工作区根
 * @param samplePaths - listFiles 返回的绝对路径样本
 */
export function detectWorkspaceLanguageFromPaths(
  workspacePath: string,
  samplePaths: string[],
): WorkspaceLanguage {
  const enMarker = WORKSPACE_LAYOUT.en.LOG_AND_PLAN
  const zhMarker = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN
  for (const p of samplePaths) {
    const rel = getRelativeVaultPath(workspacePath, p)
    if (rel.startsWith(`${enMarker}/`) || rel === enMarker) return 'en'
    if (rel.startsWith(`${zhMarker}/`) || rel === zhMarker) return 'zh'
  }
  return 'zh'
}

/**
 * 路径段是否含 dot 目录（.codex、.claude 等）
 * @param relativePath - 相对工作区路径
 */
export function hasDotPathSegment(relativePath: string): boolean {
  return normalizeVaultPath(relativePath)
    .split('/')
    .some((seg) => seg.startsWith('.'))
}

/**
 * 是否为 CLI skill 配置路径
 * @param relativePath - 相对工作区路径
 */
export function isSkillConfigPath(relativePath: string): boolean {
  const norm = normalizeVaultPath(relativePath).toLowerCase()
  if (norm.includes('/skills/')) return true
  const base = norm.split('/').pop() || ''
  return base === 'skill.md'
}

/**
 * Agent 写回的活跃控制文件（保留在知识索引中）
 * @param relativePath - 相对工作区路径
 * @param language - 工作区语言
 */
export function isLivingControlFile(relativePath: string, language: WorkspaceLanguage): boolean {
  const templatesDir = getTemplatesDir(language)
  const norm = normalizeVaultPath(relativePath)
  const living = [WORKSPACE_FILES.MASTER_CONTROL, WORKSPACE_FILES.SECOND_MIND]
  return living.some((name) => norm === `${templatesDir}/${name}` || norm.endsWith(`/${name}`))
}

/**
 * 05_ 下静态模板（不参与知识统计，但 slash 可读）
 * @param relativePath - 相对工作区路径
 * @param language - 工作区语言
 */
export function isStaticTemplateFile(relativePath: string, language: WorkspaceLanguage): boolean {
  const templatesDir = getTemplatesDir(language)
  const norm = normalizeVaultPath(relativePath)
  if (!norm.startsWith(`${templatesDir}/`)) return false
  if (isLivingControlFile(relativePath, language)) return false
  return norm.endsWith('.md')
}

/**
 * 情报原件归档目录（不参与知识索引）
 * @param relativePath - 相对工作区路径
 * @param language - 工作区语言
 */
export function isIntelligenceSourcesPath(relativePath: string, language: WorkspaceLanguage): boolean {
  const intelDir = WORKSPACE_LAYOUT[language].INTELLIGENCE
  const norm = normalizeVaultPath(relativePath)
  return norm.startsWith(`${intelDir}/sources/`) || norm === `${intelDir}/sources`
}

/**
 * 侧栏文件树中隐藏的路径（CLI 配置层，非用户知识）
 * @param workspacePath - 工作区根
 * @param filePath - 文件或目录绝对路径
 */
export function isHiddenFromFileTree(workspacePath: string, filePath: string): boolean {
  const rel = getRelativeVaultPath(workspacePath, filePath)
  if (!rel || rel.includes('..')) return false
  if (hasDotPathSegment(rel)) return true
  return isRootAgentConfigFile(rel)
}

/** 侧栏文件树中应显示的路径（用户笔记层，非 CLI / Agent 配置） */
export function isVisibleInFileTree(workspacePath: string, filePath: string): boolean {
  return !isHiddenFromFileTree(workspacePath, filePath)
}

/** 与文件树一致：仅保留用户可见的 Markdown 文件 */
export function filterMarkdownFilesForFileTree<T extends { path: string; name: string; isDirectory?: boolean }>(
  workspacePath: string,
  files: readonly T[],
): T[] {
  return files.filter(
    (file) =>
      !file.isDirectory &&
      /\.md$/i.test(file.name) &&
      isVisibleInFileTree(workspacePath, file.path),
  )
}

/**
 * 工作区根目录 Agent 配置（GEMINI.md / CLAUDE.md 等，init 时复制，非用户知识）
 */
export function isRootAgentConfigFile(relativePath: string): boolean {
  const norm = normalizeVaultPath(relativePath)
  if (norm.includes('/')) return false
  const lower = norm.toLowerCase()
  return AGENT_ROOT_CONFIG_FILES.some((name) => name.toLowerCase() === lower)
}

/**
 * 是否属于知识层（应进入索引 / 图谱 / 链接债务）
 * @param workspacePath - 工作区根
 * @param filePath - 文件绝对路径
 * @param language - 工作区语言
 */
export function isVaultContentFile(
  workspacePath: string,
  filePath: string,
  language: WorkspaceLanguage = 'zh',
): boolean {
  if (!filePath.toLowerCase().endsWith('.md')) return false

  const rel = getRelativeVaultPath(workspacePath, filePath)
  if (!rel || rel.includes('..')) return false

  if (hasDotPathSegment(rel)) return false
  if (isSkillConfigPath(rel)) return false
  if (isRootAgentConfigFile(rel)) return false
  if (isIntelligenceSourcesPath(rel, language)) return false
  if (isLivingControlFile(rel, language)) return true
  if (isStaticTemplateFile(rel, language)) return false

  if (/^readme\.md$/i.test(rel)) return false

  return true
}

/**
 * 图谱节点 ID：相对路径去掉 .md 后缀（路径级唯一）
 * @param workspacePath - 工作区根
 * @param filePath - 文件绝对路径
 */
export function getVaultNodeKey(workspacePath: string, filePath: string): string {
  return getRelativeVaultPath(workspacePath, filePath).replace(/\.md$/i, '')
}
