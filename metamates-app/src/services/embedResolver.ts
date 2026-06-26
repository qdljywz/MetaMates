export interface BlockRef {
  note: string
  blockId?: string
  alias?: string
}

const WIKI_LINK = /\[\[([^\]|#]+)(?:#(\^[^\]|]+))?(?:\|([^\]]+))?\]\]/g
const EMBED_LINK = /!\[\[([^\]|#]+)(?:#(\^[^\]|]+))?(?:\|([^\]]+))?\]\]/g

export function parseBlockRef(target: string): BlockRef {
  const parsed = parseLinkTarget(target)
  return {
    note: parsed.note,
    blockId: parsed.blockId,
    alias: parsed.heading,
  }
}

export function parseLinkTarget(target: string): { note: string; heading?: string; blockId?: string } {
  const hashIndex = target.indexOf('#')
  if (hashIndex === -1) return { note: target.trim() }

  const note = target.slice(0, hashIndex).trim()
  const suffix = target.slice(hashIndex + 1).trim()
  if (suffix.startsWith('^')) {
    return { note, blockId: suffix.slice(1) }
  }
  return { note, heading: suffix }
}

export function findHeadingLine(content: string, heading: string): number | null {
  const normalized = heading.trim().toLowerCase()
  const lines = stripFrontmatter(content).split('\n')

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#{1,6}\s+(.+)$/)
    if (!match) continue
    const text = match[1].trim().toLowerCase()
    if (text === normalized) return i + 1
  }

  return null
}

export function findBlockLine(content: string, blockId: string): number | null {
  const lines = stripFrontmatter(content).split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (extractBlockId(lines[i]) === blockId) return i + 1
  }
  return null
}

export async function resolveLinkLine(content: string, linkTarget: string): Promise<number | undefined> {
  const { heading, blockId } = parseLinkTarget(linkTarget)
  if (blockId) {
    return findBlockLine(content, blockId) ?? undefined
  }
  if (heading) {
    return findHeadingLine(content, heading) ?? undefined
  }
  return undefined
}

export function extractBlockId(line: string): string | null {
  const match = line.match(/\s+\^([a-zA-Z0-9_-]+)\s*$/)
  return match ? match[1] : null
}

export function extractHeadingContent(content: string, heading: string): string | null {
  const lines = stripFrontmatter(content).split('\n')
  const normalized = heading.trim().toLowerCase()
  let start = -1
  let level = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (!match) continue

    if (start === -1) {
      if (match[2].trim().toLowerCase() === normalized) {
        start = i
        level = match[1].length
      }
      continue
    }

    if (match[1].length <= level) break
  }

  if (start === -1) return null

  const collected: string[] = []
  for (let i = start; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (i > start && match && match[1].length <= level) break
    collected.push(lines[i])
  }

  return collected.join('\n').trim() || null
}

export function extractBlockContent(content: string, blockId: string): string | null {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const id = extractBlockId(lines[i])
    if (id !== blockId) continue

    const collected: string[] = [lines[i].replace(/\s+\^[a-zA-Z0-9_-]+\s*$/, '').trimEnd()]
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (/^#{1,6}\s/.test(next) || /^!\[\[/.test(next) || /^\[\[/.test(next)) break
      if (next.trim() === '' && j > i + 1) break
      collected.push(next)
    }
    return collected.join('\n').trim()
  }
  return null
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

export { WIKI_LINK, EMBED_LINK }
