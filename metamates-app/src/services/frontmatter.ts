export type FrontmatterValue = string | number | boolean | string[]

export interface ParsedFrontmatter {
  properties: Record<string, FrontmatterValue>
  body: string
  rawBlock: string | null
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => parseScalar(item.trim()) as string)
  }
  return trimmed
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) {
    return { properties: {}, body: content, rawBlock: null }
  }

  const properties: Record<string, FrontmatterValue> = {}
  const lines = match[1].split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex <= 0) continue
    const key = trimmed.slice(0, colonIndex).trim()
    const value = trimmed.slice(colonIndex + 1).trim()
    properties[key] = parseScalar(value)
  }

  return {
    properties,
    body: content.slice(match[0].length),
    rawBlock: match[0],
  }
}

export function stringifyFrontmatter(properties: Record<string, FrontmatterValue>): string {
  const lines = Object.entries(properties).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: [${value.map((item) => JSON.stringify(String(item))).join(', ')}]`
    }
    if (typeof value === 'string' && /[:#\[\]{}]/.test(value)) {
      return `${key}: "${value.replace(/"/g, '\\"')}"`
    }
    return `${key}: ${value}`
  })
  return `---\n${lines.join('\n')}\n---\n`
}

export function updateFrontmatter(content: string, properties: Record<string, FrontmatterValue>): string {
  const parsed = parseFrontmatter(content)
  if (Object.keys(properties).length === 0) {
    return parsed.body.replace(/^\n/, '')
  }
  const nextBlock = stringifyFrontmatter(properties)
  return `${nextBlock}${parsed.body.replace(/^\n/, '')}`
}

export function setFrontmatterProperty(
  content: string,
  key: string,
  value: FrontmatterValue | undefined
): string {
  const parsed = parseFrontmatter(content)
  const next = { ...parsed.properties }
  if (value === undefined || value === '') {
    delete next[key]
  } else {
    next[key] = value
  }
  if (Object.keys(next).length === 0) {
    return parsed.body.replace(/^\n/, '')
  }
  return `${stringifyFrontmatter(next)}${parsed.body.replace(/^\n/, '')}`
}
