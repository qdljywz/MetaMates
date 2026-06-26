/**
 * Cross-platform path safety helpers (browser + Node safe — no node:path import).
 */

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, '/')
}

export function isAbsolutePath(filePath: string): boolean {
  if (!filePath) return false
  if (filePath.startsWith('/')) return true
  return /^[a-zA-Z]:[\\/]/.test(filePath)
}

export function resolvePath(base: string, filePath: string): string {
  const fileNorm = normalizeSlashes(filePath)

  if (isAbsolutePath(filePath)) {
    return normalizeResolved(fileNorm)
  }

  if (filePath === '.' || filePath === './') {
    return normalizeResolved(normalizeSlashes(base))
  }

  const baseNorm = normalizeSlashes(base).replace(/\/+$/, '')
  const driveMatch = /^[a-zA-Z]:/.exec(baseNorm)
  const drive = driveMatch ? driveMatch[0] : ''
  const baseWithoutDrive = drive ? baseNorm.slice(drive.length) : baseNorm
  const combined = `${baseWithoutDrive}/${fileNorm}`.replace(/\/+/g, '/')
  const resolved = normalizeSegments(combined)
  return drive ? `${drive}/${resolved.replace(/^\//, '')}` : resolved
}

function normalizeSegments(input: string): string {
  const parts = input.split('/').filter((part) => part.length > 0)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return `/${stack.join('/')}`
}

function normalizeResolved(input: string): string {
  const norm = normalizeSlashes(input)
  const driveMatch = /^([a-zA-Z]:)(\/.*)?$/.exec(norm)
  if (driveMatch) {
    const tail = driveMatch[2] || '/'
    const normalizedTail = normalizeSegments(tail)
    const withoutLeadingSlash = normalizedTail.replace(/^\//, '')
    return withoutLeadingSlash ? `${driveMatch[1]}/${withoutLeadingSlash}` : `${driveMatch[1]}/`
  }
  return normalizeSegments(norm)
}

export function relativePath(from: string, to: string): string {
  const fromResolved = normalizeSlashes(resolvePath(from, '.')).replace(/\/+$/, '')
  const toResolved = normalizeSlashes(resolvePath(to, '.')).replace(/\/+$/, '')

  const fromParts = fromResolved.split('/').filter(Boolean)
  const toParts = toResolved.split('/').filter(Boolean)

  if (/^[a-zA-Z]:/.test(fromResolved) && /^[a-zA-Z]:/.test(toResolved)) {
    if (fromParts[0]?.toLowerCase() !== toParts[0]?.toLowerCase()) {
      return toResolved
    }
    fromParts.shift()
    toParts.shift()
  }

  let index = 0
  while (index < fromParts.length && index < toParts.length && fromParts[index].toLowerCase() === toParts[index].toLowerCase()) {
    index++
  }

  const ups = fromParts.length - index
  const relParts = [...Array(ups).fill('..'), ...toParts.slice(index)]
  return relParts.join('/') || ''
}

export function isPathWithinRoot(root: string, target: string): boolean {
  const rootResolved = resolvePath(root, '.')
  const targetResolved = resolvePath(target, '.')
  const rootDrive = /^[a-zA-Z]:/.exec(normalizeSlashes(rootResolved))?.[0]?.toLowerCase()
  const targetDrive = /^[a-zA-Z]:/.exec(normalizeSlashes(targetResolved))?.[0]?.toLowerCase()
  if (rootDrive && targetDrive && rootDrive !== targetDrive) return false
  const rel = relativePath(rootResolved, targetResolved)
  if (rel === '') return true
  return !rel.startsWith('..') && !isAbsolutePath(rel)
}

export type PathAssertResult =
  | { ok: true; resolved: string }
  | { ok: false; error: string }

export function assertWithinWorkspace(
  workspacePath: string,
  filePath: string,
): PathAssertResult {
  if (!workspacePath?.trim()) {
    return { ok: false, error: 'No workspace selected' }
  }
  const resolved = isAbsolutePath(filePath)
    ? normalizeResolved(normalizeSlashes(filePath))
    : resolvePath(workspacePath, filePath)
  if (!isPathWithinRoot(workspacePath, resolved)) {
    return { ok: false, error: 'Path is outside workspace' }
  }
  return { ok: true, resolved }
}

export function pathAssertError(result: PathAssertResult): string | null {
  if (result.ok === false) return result.error
  return null
}

export function pathAssertResolved(result: PathAssertResult): string | null {
  if (result.ok === true) return result.resolved
  return null
}

export function isPathInsideWorkspace(workspacePath: string, filePath: string): boolean {
  if (!workspacePath?.trim() || !filePath?.trim()) return false
  return assertWithinWorkspace(workspacePath, filePath).ok === true
}

export function toWorkspaceRelativePath(workspacePath: string, filePath: string): string | null {
  const guard = assertWithinWorkspace(workspacePath, filePath)
  if (!guard.ok) return null
  const rel = relativePath(workspacePath, guard.resolved)
  if (rel.startsWith('..') || isAbsolutePath(rel)) return null
  return rel.replace(/\\/g, '/')
}
