export interface ToolDiffStats {
  fileName: string
  insertions: number
  deletions: number
  unifiedDiff: string
}

function countDiffLines(unifiedDiff: string): { insertions: number; deletions: number; fileName: string } {
  let fileName = ''
  let insertions = 0
  let deletions = 0

  for (const line of unifiedDiff.split('\n')) {
    if (!fileName) {
      const bMatch = line.match(/^\+\+\+ b\/(.+)/)
      if (bMatch) {
        fileName = bMatch[1]
        continue
      }
      const aMatch = line.match(/^--- a\/(.+)/)
      if (aMatch) {
        fileName = aMatch[1]
        continue
      }
    }
    if (line.startsWith('+') && !line.startsWith('+++')) insertions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }

  if (fileName) {
    const parts = fileName.split(/[/\\]/)
    fileName = parts[parts.length - 1] || fileName
  }

  return { insertions, deletions, fileName: fileName || 'file' }
}

function buildUnifiedDiff(oldText: string, newText: string, fileName = 'file'): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const lines = [
    `--- a/${fileName}`,
    `+++ b/${fileName}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ]

  const max = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine === newLine) {
      if (oldLine !== undefined) lines.push(` ${oldLine}`)
    } else {
      if (oldLine !== undefined) lines.push(`-${oldLine}`)
      if (newLine !== undefined) lines.push(`+${newLine}`)
    }
  }

  return lines.join('\n')
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

export function extractToolDiff(rawInput?: string, content?: string): ToolDiffStats | null {
  const sources = [rawInput, content].filter(Boolean) as string[]

  for (const source of sources) {
    if (/^--- a\/|^@@\s|-\s|^\+\s/m.test(source) && source.includes('\n')) {
      const stats = countDiffLines(source)
      if (stats.insertions + stats.deletions > 0 || source.includes('@@')) {
        return { ...stats, unifiedDiff: source }
      }
    }

    const parsed = tryParseJson(source)
    if (!parsed) continue

    const unified =
      pickString(parsed, ['unified_diff', 'unifiedDiff', 'diff']) ||
      (parsed.data && typeof parsed.data === 'object'
        ? pickString(parsed.data as Record<string, unknown>, ['unified_diff', 'unifiedDiff', 'diff'])
        : undefined)

    if (unified) {
      const stats = countDiffLines(unified)
      return { ...stats, unifiedDiff: unified }
    }

    const oldText = pickString(parsed, ['old_string', 'oldString', 'old_text', 'before'])
    const newText = pickString(parsed, ['new_string', 'newString', 'new_text', 'after'])
    if (oldText !== undefined && newText !== undefined && oldText !== newText) {
      const fileName =
        pickString(parsed, ['path', 'file_path', 'filePath', 'relativePath']) ||
        'file'
      const unifiedDiff = buildUnifiedDiff(oldText, newText, fileName.split(/[/\\]/).pop() || fileName)
      const stats = countDiffLines(unifiedDiff)
      return { fileName: stats.fileName, insertions: stats.insertions, deletions: stats.deletions, unifiedDiff }
    }
  }

  return null
}
