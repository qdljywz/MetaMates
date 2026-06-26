import * as fs from 'fs'
import * as path from 'path'
import { SemanticSearchEngine } from './shared/semanticSearch'
import {
  getLayout,
  LEGACY_PATHS,
  WORKSPACE_FILES,
  type WorkspaceLanguage,
} from './workspaceLayout'

export interface MigrateResult {
  success: boolean
  migrated: string[]
  skipped: string[]
  error?: string
}

/**
 * 将旧版工作区路径迁移到标准 inits 目录结构（只复制/合并，不删除旧文件）
 */
export function migrateWorkspace(
  workspacePath: string,
  language: WorkspaceLanguage = 'zh'
): MigrateResult {
  const migrated: string[] = []
  const skipped: string[] = []

  try {
    const layout = getLayout(language)

    mergeDirectory(
      path.join(workspacePath, LEGACY_PATHS.DAILY_PLAN_DIR),
      path.join(workspacePath, layout.LOG_AND_PLAN),
      migrated,
      skipped
    )

    const legacyMcRoot = path.join(workspacePath, LEGACY_PATHS.MASTER_CONTROL_ROOT)
    const standardMc = path.join(workspacePath, layout.TEMPLATES, WORKSPACE_FILES.MASTER_CONTROL)
    copyFileIfMissing(legacyMcRoot, standardMc, migrated, skipped)

    return { success: true, migrated, skipped }
  } catch (error: any) {
    return { success: false, migrated, skipped, error: error.message }
  }
}

/**
 * 检测工作区是否仍使用旧版路径
 */
export function detectLegacyPaths(workspacePath: string, language: WorkspaceLanguage = 'zh'): string[] {
  const found: string[] = []
  const layout = getLayout(language)

  if (fs.existsSync(path.join(workspacePath, LEGACY_PATHS.DAILY_PLAN_DIR))) {
    found.push(LEGACY_PATHS.DAILY_PLAN_DIR)
  }
  if (fs.existsSync(path.join(workspacePath, LEGACY_PATHS.MASTER_CONTROL_ROOT))) {
    found.push(LEGACY_PATHS.MASTER_CONTROL_ROOT)
  }

  const standardDaily = path.join(workspacePath, layout.LOG_AND_PLAN)
  if (
    fs.existsSync(path.join(workspacePath, LEGACY_PATHS.DAILY_PLAN_DIR)) &&
    !fs.existsSync(standardDaily)
  ) {
    found.push('needs_migration')
  }

  return found
}

function mergeDirectory(
  srcDir: string,
  destDir: string,
  migrated: string[],
  skipped: string[]
): void {
  if (!fs.existsSync(srcDir)) return

  if (!fs.existsSync(destDir)) {
    fs.cpSync(srcDir, destDir, { recursive: true })
    migrated.push(`${path.basename(srcDir)} → ${path.basename(destDir)}`)
    return
  }

  mergeDirContents(srcDir, destDir, '', migrated, skipped)
}

function mergeDirContents(
  srcDir: string,
  destDir: string,
  relativePath: string,
  migrated: string[],
  skipped: string[]
): void {
  const items = fs.readdirSync(srcDir, { withFileTypes: true })

  for (const item of items) {
    const srcPath = path.join(srcDir, item.name)
    const destPath = path.join(destDir, item.name)
    const itemRelative = relativePath ? `${relativePath}/${item.name}` : item.name

    if (item.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true })
      }
      mergeDirContents(srcPath, destPath, itemRelative, migrated, skipped)
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath)
      migrated.push(itemRelative)
    } else {
      skipped.push(itemRelative)
    }
  }
}

function copyFileIfMissing(
  srcFile: string,
  destFile: string,
  migrated: string[],
  skipped: string[]
): void {
  if (!fs.existsSync(srcFile)) return

  if (!fs.existsSync(path.dirname(destFile))) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true })
  }

  if (!fs.existsSync(destFile)) {
    fs.copyFileSync(srcFile, destFile)
    migrated.push(`${path.basename(srcFile)} → ${path.relative(path.dirname(destFile), destFile)}`)
  } else {
    skipped.push(path.basename(destFile))
  }
}

/**
 * 扫描工作区 Markdown 文件（供 Vault API 使用）
 */
export function listMarkdownFiles(
  dirPath: string,
  recursive = true
): { name: string; path: string; isDirectory: boolean }[] {
  const results: { name: string; path: string; isDirectory: boolean }[] = []

  function walk(current: string): void {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const item of items) {
      if (item.name.startsWith('.')) continue
      const fullPath = path.join(current, item.name)
      if (item.isDirectory()) {
        if (recursive) walk(fullPath)
      } else if (item.name.endsWith('.md')) {
        results.push({ name: item.name, path: fullPath, isDirectory: false })
      }
    }
  }

  walk(dirPath)
  return results
}

/**
 * 简单全文搜索（供 Vault API / MCP 桥接）
 */
export function searchMarkdownFiles(
  workspacePath: string,
  query: string,
  limit = 20
): { path: string; name: string; score: number; snippets: string[] }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const files = listMarkdownFiles(workspacePath, true)
  const results: { path: string; name: string; score: number; snippets: string[] }[] = []

  for (const file of files) {
    let content: string
    try {
      content = fs.readFileSync(file.path, 'utf-8')
    } catch {
      continue
    }

    const lower = content.toLowerCase()
    let score = 0
    const snippets: string[] = []

    for (const term of terms) {
      if (lower.includes(term)) {
        score += (lower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      }
    }

    if (score > 0) {
      const lines = content.split('\n')
      for (const line of lines) {
        if (terms.some((t) => line.toLowerCase().includes(t))) {
          snippets.push(line.slice(0, 120))
          if (snippets.length >= 3) break
        }
      }
      results.push({ path: file.path, name: file.name, score, snippets })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * TF-IDF 语义搜索（离线，供 Vault API 使用）
 */
export function searchMarkdownSemantic(
  workspacePath: string,
  query: string,
  limit = 20
): { path: string; name: string; score: number; snippets: string[] }[] {
  const files = listMarkdownFiles(workspacePath, true)
  if (files.length === 0) return []

  const engine = new SemanticSearchEngine()
  const documents: { id: string; text: string }[] = []

  for (const file of files) {
    let content: string
    try {
      content = fs.readFileSync(file.path, 'utf-8')
    } catch {
      continue
    }
    documents.push({ id: file.path, text: `${file.name}\n${content}` })
  }

  engine.build(documents)
  const hits = engine.search(query, limit)

  return hits.map((hit) => {
    const file = files.find((f) => f.path === hit.id)
    const name = file?.name || path.basename(hit.id)
    let snippets: string[] = []
    if (file) {
      try {
        const content = fs.readFileSync(file.path, 'utf-8')
        const firstLine = content.split('\n').find((l) => l.trim()) || ''
        snippets = [firstLine.slice(0, 120)]
      } catch {
        snippets = []
      }
    }
    return { path: hit.id, name, score: Math.round(hit.score * 1000) / 10, snippets }
  })
}
